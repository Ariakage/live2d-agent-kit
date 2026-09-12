#!/usr/bin/env python3
"""Standard-library structural checks; never substitutes for Cubism Core/rendering."""

from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
import math
import re
import struct
import sys
import urllib.parse
import zlib
from pathlib import Path, PurePosixPath, PureWindowsPath


class ValidationError(ValueError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path):
    try:
        def unique_pairs(pairs):
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValidationError(f"Duplicate JSON key: {key}")
                result[key] = value
            return result
        with path.open("r", encoding="utf-8-sig") as stream:
            data = json.load(stream, object_pairs_hook=unique_pairs)
        check_finite(data)
        return data
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValidationError(f"Cannot read JSON {path.name}: {exc}") from exc


def check_finite(value, location="$"):
    if isinstance(value, float) and not math.isfinite(value):
        raise ValidationError(f"Non-finite number at {location}")
    if isinstance(value, dict):
        for key, item in value.items():
            check_finite(item, f"{location}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            check_finite(item, f"{location}[{index}]")


def number(value) -> bool:
    return (isinstance(value, int) and not isinstance(value, bool)) or (isinstance(value, float) and math.isfinite(value))


def png_info(path: Path) -> dict:
    """Read/verify PNG IHDR only, not image pixels or the complete stream."""
    try:
        with path.open("rb") as stream:
            header = stream.read(33)
    except OSError as exc:
        raise ValidationError(f"Cannot read PNG {path.name}: {exc}") from exc
    if len(header) != 33 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValidationError(f"Not a PNG with a complete IHDR: {path.name}")
    if header[8:16] != b"\x00\x00\x00\rIHDR":
        raise ValidationError(f"PNG first chunk must be a 13-byte IHDR: {path.name}")
    if zlib.crc32(header[12:29]) & 0xffffffff != struct.unpack(">I", header[29:33])[0]:
        raise ValidationError(f"PNG IHDR CRC mismatch: {path.name}")
    width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", header[16:29])
    allowed = {0: {1, 2, 4, 8, 16}, 2: {8, 16}, 3: {1, 2, 4, 8}, 4: {8, 16}, 6: {8, 16}}
    if not 0 < width <= 0x7fffffff or not 0 < height <= 0x7fffffff:
        raise ValidationError(f"Invalid PNG dimensions: {path.name}")
    if depth not in allowed.get(color, set()) or compression != 0 or filtering != 0 or interlace not in (0, 1):
        raise ValidationError(f"Invalid PNG IHDR fields: {path.name}")
    return {"width": width, "height": height, "bitDepth": depth, "colorType": color,
            "headerOnly": True}


def safe_reference(root: Path, reference: str) -> Path:
    """Resolve a portable runtime reference, rejecting traversal and symlink escape."""
    if not isinstance(reference, str) or not reference or reference != reference.strip():
        raise ValidationError("Runtime reference must be a nonempty relative path")
    if "\\" in reference or "\x00" in reference or re.search(r"[\x00-\x1f]", reference):
        raise ValidationError(f"Unsafe runtime path: {reference!r}")
    if urllib.parse.urlsplit(reference).scheme or reference.startswith("//"):
        raise ValidationError(f"URLs/drive paths are forbidden in runtime references: {reference}")
    path = PurePosixPath(reference)
    if path.is_absolute() or PureWindowsPath(reference).is_absolute() or ".." in path.parts:
        raise ValidationError(f"Absolute or parent-traversing runtime path: {reference}")
    if "?" in reference or "#" in reference or urllib.parse.unquote(reference) != reference:
        raise ValidationError(f"Runtime paths must be literal paths, not URL-encoded URLs: {reference}")
    if not path.parts or path == PurePosixPath("."):
        raise ValidationError("Runtime reference cannot name the model directory")
    root = root.resolve()
    target = (root / path).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise ValidationError(f"Runtime symlink escapes model directory: {reference}") from exc
    if not target.is_file():
        raise ValidationError(f"Missing runtime file: {reference}")
    return target


def model_references(model: dict) -> dict[str, str]:
    """Return label -> file reference for standard Model3 dependencies (including sound)."""
    if not isinstance(model, dict) or model.get("Version") != 3:
        raise ValidationError("Expected a Model3 JSON object with Version=3")
    refs = model.get("FileReferences")
    if not isinstance(refs, dict):
        raise ValidationError("FileReferences must be an object")
    result = {}

    def add(label, value):
        if not isinstance(value, str) or not value:
            raise ValidationError(f"{label} must be a nonempty file path")
        result[label] = value

    add("Moc", refs.get("Moc"))
    textures = refs.get("Textures")
    if not isinstance(textures, list) or not textures:
        raise ValidationError("Textures must be a nonempty list")
    for index, value in enumerate(textures):
        add(f"Textures[{index}]", value)
    for key, value in refs.items():
        if key in ("Moc", "Textures", "Motions", "Expressions"):
            continue
        # Standard optional references and future direct string file references.
        if isinstance(value, str):
            add(key, value)
        elif value is not None:
            raise ValidationError(f"Unsupported non-string FileReferences.{key}; review before packaging")
    motions = refs.get("Motions", {})
    if not isinstance(motions, dict):
        raise ValidationError("Motions must be an object of motion groups")
    for group, items in motions.items():
        if not isinstance(items, list):
            raise ValidationError(f"Motions.{group} must be a list")
        for index, item in enumerate(items):
            if not isinstance(item, dict):
                raise ValidationError(f"Motions.{group}[{index}] must be an object")
            add(f"Motions.{group}[{index}].File", item.get("File"))
            if "Sound" in item:
                add(f"Motions.{group}[{index}].Sound", item["Sound"])
    expressions = refs.get("Expressions", [])
    if not isinstance(expressions, list):
        raise ValidationError("Expressions must be a list")
    for index, item in enumerate(expressions):
        if not isinstance(item, dict):
            raise ValidationError(f"Expressions[{index}] must be an object")
        add(f"Expressions[{index}].File", item.get("File"))
    return result


def base_report(kind: str) -> dict:
    return {"validator": "live2d-agent-kit-structural", "kind": kind, "passed": False,
            "errors": [], "warnings": [], "nativeCoreValidated": False,
            "scope": "Structural checks only. No native Core execution, rendering, artistic review, or VTube Studio test."}


def issue(report, code, message, location="", warning=False):
    report["warnings" if warning else "errors"].append({"code": code, "location": location, "message": message})


def validate_model(model_path: Path, core_report: Path | None = None) -> dict:
    model_path = Path(model_path).resolve()
    report = base_report("runtime")
    report["model"] = model_path.name
    report["files"] = {}
    try:
        model = load_json(model_path)
        references = model_references(model)
    except (ValidationError, OSError) as exc:
        issue(report, "model_json", str(exc))
        return report
    moc_path = None
    for label, reference in references.items():
        try:
            target = safe_reference(model_path.parent, reference)
            detail = {"sha256": sha256(target), "bytes": target.stat().st_size}
            if label == "Moc":
                moc_path = target
                with target.open("rb") as stream:
                    header = stream.read(8)
                if len(header) < 8 or header[:4] != b"MOC3" or header[4] == 0:
                    raise ValidationError("MOC3 magic/version header is missing or invalid")
                if detail["bytes"] <= 8:
                    raise ValidationError("Eight-byte placeholder MOC3 is not a model")
                detail["mocHeaderVersion"] = header[4]
                detail["headerOnly"] = True
            elif label.startswith("Textures["):
                detail.update(png_info(target))
            elif target.suffix.lower() == ".json":
                load_json(target)
            report["files"][reference] = detail
        except (ValidationError, OSError, ValueError) as exc:
            issue(report, "runtime_reference", str(exc), label)
    if model_path.is_file():
        report["modelJsonSha256"] = sha256(model_path)
    if moc_path is not None and moc_path.is_file():
        report["mocSha256"] = sha256(moc_path)
    if core_report is not None:
        try:
            native = load_json(Path(core_report))
            if not isinstance(native, dict) or native.get("validator") != "local-official-cubism-core":
                raise ValidationError("Core report validator must be local-official-cubism-core")
            if native.get("passed") is not True:
                raise ValidationError("Core report did not pass")
            if not report.get("mocSha256") or native.get("sha256") != report["mocSha256"]:
                raise ValidationError("Core report SHA-256 does not match the exact MOC3")
            if "fileBytes" in native and native["fileBytes"] != moc_path.stat().st_size:
                raise ValidationError("Core report byte count does not match the MOC3")
            report["nativeCoreValidated"] = True
            report["nativeCoreEvidence"] = {"validator": native["validator"], "sha256": native["sha256"],
                                            "passed": True, "coreVersion": native.get("coreVersion"),
                                            "checkedAt": native.get("checkedAt"),
                                            "source": "Supplied report matched; Core was not rerun by this command."}
        except (ValidationError, OSError) as exc:
            issue(report, "core_report", str(exc))
    else:
        issue(report, "core_not_run", "No official Core report supplied. Header checks cannot establish an internally valid MOC3.", warning=True)
    report["passed"] = not report["errors"]
    if not report["passed"]:
        report["nativeCoreValidated"] = False
    return report


def local_asset(root: Path, reference: str, report: dict, label: str) -> Path:
    """Authoring recipes may use external local files; exported runtimes may not."""
    if not isinstance(reference, str) or not reference or "\x00" in reference:
        raise ValidationError("Asset path must be a nonempty local file path")
    if "://" in reference or reference.startswith("//"):
        raise ValidationError("Manifest assets must be local files, not URLs")
    path = Path(reference).expanduser()
    if path.is_absolute() or ".." in path.parts:
        issue(report, "nonportable_asset", "Local absolute/parent asset path is supported but must be copied or normalized before sharing.", label, True)
    target = (root / path).resolve()
    if not target.is_file():
        raise ValidationError(f"Missing asset: {reference}")
    return target


def check_rect(value, size, label, report, bounded=True):
    if not isinstance(value, list) or len(value) != 4 or not all(number(n) for n in value):
        issue(report, "rectangle", "Expected [x, y, width, height] with finite numbers", label)
        return
    x, y, width, height = value
    if width <= 0 or height <= 0:
        issue(report, "rectangle", "Rectangle width and height must be positive", label)
    elif bounded and (x < 0 or y < 0 or x + width > size[0] or y + height > size[1]):
        issue(report, "rectangle_bounds", f"Rectangle exceeds source bounds {size[0]} × {size[1]}", label)


def check_polygons(value, size, label, report):
    if not isinstance(value, list):
        issue(report, "polygons", "Expected a list of polygons", label)
        return
    for index, polygon in enumerate(value):
        location = f"{label}[{index}]"
        if not isinstance(polygon, list) or len(polygon) < 3:
            issue(report, "polygon", "Polygon must contain at least three points", location)
            continue
        for point in polygon:
            if not isinstance(point, list) or len(point) != 2 or not all(number(n) for n in point):
                issue(report, "polygon_point", "Expected finite [x,y] source coordinates", location)
            elif not (0 <= point[0] <= size[0] and 0 <= point[1] <= size[1]):
                issue(report, "polygon_bounds", f"Point {point} exceeds source bounds {size[0]} × {size[1]}", location)


def validate_manifest(manifest_path: Path) -> dict:
    manifest_path = Path(manifest_path).resolve()
    report = base_report("manifest")
    report["scope"] = "Authoring recipe and source PNG header checks only; no matte, mesh, render, or Core validation."
    report["manifest"] = manifest_path.name
    report["layers"] = []
    try:
        manifest = load_json(manifest_path)
        if not isinstance(manifest, dict):
            raise ValidationError("Manifest must be an object")
    except ValidationError as exc:
        issue(report, "manifest_json", str(exc))
        return report
    if not isinstance(manifest.get("name"), str) or not manifest["name"].strip():
        issue(report, "name", "Manifest name must be a nonempty string")
    for key in ("width", "height"):
        value = manifest.get(key, manifest.get("canvas_" + key))
        if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
            issue(report, "canvas_size", f"{key} (or canvas_{key}) must be a positive integer", key)
    layers = manifest.get("layers")
    if not isinstance(layers, list) or not layers:
        issue(report, "layers", "Manifest layers must be a nonempty list")
        return report
    names = set()
    for index, layer in enumerate(layers):
        label = f"layers[{index}]"
        if not isinstance(layer, dict):
            issue(report, "layer", "Layer must be an object", label)
            continue
        name = layer.get("name")
        if not isinstance(name, str) or not name.strip():
            issue(report, "layer_name", "Layer name must be a nonempty string", label)
        elif name in names:
            issue(report, "layer_name", f"Duplicate layer name: {name}", label)
        else:
            names.add(name)
        for key in ("x", "y", "z", "w", "h", "scale", "rotation", "opacity"):
            if key in layer and not number(layer[key]):
                issue(report, "layer_number", f"{key} must be a finite number", label)
        for key in ("w", "h", "scale"):
            if key in layer and number(layer[key]) and layer[key] <= 0:
                issue(report, "layer_size", f"{key} must be positive", label)
        if "opacity" in layer and number(layer["opacity"]) and not 0 <= layer["opacity"] <= 1:
            issue(report, "opacity", "Layer opacity must be between 0 and 1", label)
        try:
            asset = local_asset(manifest_path.parent, layer.get("path"), report, label + ".path")
            info = png_info(asset)
            size = (info["width"], info["height"])
            report["layers"].append({"name": name, "path": layer["path"], "sha256": sha256(asset), **info})
            if "crop" in layer:
                check_rect(layer["crop"], size, label + ".crop", report)
            for key in ("source_polygons", "source_holes", "source_alpha_holes"):
                if key in layer:
                    check_polygons(layer[key], size, label + "." + key, report)
            if "source_hole_fill_sample" in layer:
                point = layer["source_hole_fill_sample"]
                if not isinstance(point, list) or len(point) != 2 or not all(number(n) for n in point):
                    issue(report, "sample_point", "Expected finite [x,y]", label)
                elif not (0 <= point[0] < size[0] and 0 <= point[1] < size[1]):
                    issue(report, "sample_bounds", "Sample must address a source pixel", label)
            fill = layer.get("source_hole_fill_image")
            if fill is not None:
                if not isinstance(fill, dict):
                    raise ValidationError("source_hole_fill_image must be an object")
                fill_path = local_asset(manifest_path.parent, fill.get("path"), report, label + ".source_hole_fill_image.path")
                fill_info = png_info(fill_path)
                if "source_rect" in fill:
                    check_rect(fill["source_rect"], (fill_info["width"], fill_info["height"]), label + ".source_rect", report)
                if "canvas_rect" in fill:
                    check_rect(fill["canvas_rect"], size, label + ".canvas_rect", report, bounded=False)
            skin = layer.get("source_skin_patch")
            if isinstance(skin, dict) and "rect" in skin:
                check_rect(skin["rect"], size, label + ".source_skin_patch.rect", report)
        except (ValidationError, OSError) as exc:
            issue(report, "source_asset", str(exc), label)
    def find_green(value, location="$", explicit=False):
        if isinstance(value, dict):
            for key, item in value.items():
                if ("despill" in key.lower() and item not in (False, None, 0)) or (key == "solid_background" and str(item).lower() in ("#00ff00", "green")):
                    issue(report, "green_matte_review", "Green-background/despill processing is configured. Review against the actual art; it can remove intentional green. No settings changed.", location + "." + key, True)
                find_green(item, location + "." + key)
        elif isinstance(value, list):
            for index, item in enumerate(value):
                find_green(item, f"{location}[{index}]")
    find_green(manifest)
    config = manifest.get("config", {})
    if not isinstance(config, dict):
        issue(report, "config", "config must be an object")
    elif "export_texture_pages" in config:
        pages = config["export_texture_pages"]
        if not isinstance(pages, list) or not pages:
            issue(report, "hd_pages", "export_texture_pages must be a nonempty list")
        else:
            for index, reference in enumerate(pages):
                try:
                    png_info(local_asset(manifest_path.parent, reference, report, f"config.export_texture_pages[{index}]"))
                except (ValidationError, OSError) as exc:
                    issue(report, "hd_pages", str(exc))
        hashes = config.get("export_texture_source_sha256", [])
        if not isinstance(pages, list) or not isinstance(hashes, list) or len(hashes) != len(pages) or not all(isinstance(s, str) and re.fullmatch(r"[0-9a-fA-F]{64}", s) for s in hashes):
            issue(report, "hd_source_hash", "Each HD page must declare its exact low-atlas SHA-256")
    report["passed"] = not report["errors"]
    return report


PINK_EXAMPLE_MOC = PurePosixPath("examples/pink-sakura/runtime/PinkSakura.moc3")


def validate_pink_example_exception(root: Path) -> dict:
    """Check one user-authorized asset exception, without treating it as Core evidence."""
    example = root / "examples" / "pink-sakura"
    model_path = example / "runtime" / "PinkSakura.model3.json"
    moc_path = root / PINK_EXAMPLE_MOC
    for required in (example / "LICENSE.md", example / "ATTRIBUTION.md", model_path, moc_path):
        # A differently licensed/located file must not borrow this exception through a symlink.
        current = required
        while current != root:
            if current.is_symlink():
                raise ValidationError("Authorized example companions must not use symlinks")
            current = current.parent
        if not required.is_file() or required.stat().st_size == 0:
            raise ValidationError(f"Authorized example requires a nonempty {required.relative_to(root).as_posix()}")
    references = model_references(load_json(model_path))
    if safe_reference(model_path.parent, references["Moc"]) != moc_path.resolve():
        raise ValidationError("Authorized example Model3 must reference the exact PinkSakura.moc3")
    runtime = validate_model(model_path)
    if not runtime["passed"]:
        detail = "; ".join(error["message"] for error in runtime["errors"])
        raise ValidationError(f"Authorized example runtime failed structural validation: {detail}")
    return {"path": PINK_EXAMPLE_MOC.as_posix(), "modelJson": model_path.relative_to(root).as_posix(),
            "mocSha256": runtime["mocSha256"], "validation": "structural-only", "nativeCoreValidated": False}


class DocumentHTMLLinks(HTMLParser):
    """Read rendered document URLs, including GitHub README image markup."""

    attributes = {"a": {"href"}, "img": {"src"}, "audio": {"src"},
                  "video": {"src", "poster"}, "source": {"src"}}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in self.attributes.get(tag, ()) and value:
                self.links.append(value.strip())


def document_links(content: str) -> list[str]:
    """Extract local-link candidates, excluding fenced/inline/HTML code examples."""
    lines = []
    fence = None
    for line in content.splitlines(keepends=True):
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if fence:
            if marker and marker[1][0] == fence[0] and len(marker[1]) >= fence[1] and not marker[2].strip():
                fence = None
            continue
        if marker:
            fence = (marker[1][0], len(marker[1]))
            continue
        lines.append(line)
    rendered = "".join(lines)
    rendered = re.sub(r"<(pre|code)\b[^>]*>.*?</\1\s*>", "", rendered, flags=re.S | re.I)
    rendered = re.sub(r"(`+)(?!`)(.*?)(?<!`)\1(?!`)", "", rendered, flags=re.S)
    parser = DocumentHTMLLinks()
    parser.feed(rendered)
    parser.close()
    links = [match.group(1).strip("<>") for match in re.finditer(
        r"!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)", rendered)]
    return links + parser.links


def validate_kit(root: Path) -> dict:
    root = root.resolve()
    report = base_report("kit")
    report["scope"] = "Repository relative-link and heuristic redistribution/privacy checks; not a license or media-content audit."
    ignored = {".git", ".cache", "work", "node_modules", ".venv", "__pycache__", ".pytest_cache"}
    text_suffixes = {".md", ".py", ".sh", ".json", ".cjs", ".js", ".java", ".kt", ".kts", ".gradle", ".toml", ".yaml", ".yml", ".txt"}
    private = re.compile(r"/" + r"(?:Users|home)" + r"/[A-Za-z0-9_.-]+/|/" + r"Volumes" + r"/[A-Za-z0-9_.-]+/")
    checked = 0
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if any(part in ignored for part in relative.parts) or not path.is_file():
            continue
        checked += 1
        if path.is_symlink():
            try:
                path.resolve().relative_to(root)
            except ValueError:
                issue(report, "kit_symlink", "Repository symlink escapes checkout", relative.as_posix())
                continue
        lower = path.name.lower()
        if path.suffix.lower() in {".bin", ".param", ".pth", ".pt", ".onnx", ".safetensors", ".moc3", ".cmo3", ".dylib", ".so", ".dll", ".jar"} or ("live2dcubismcore" in lower and not lower.endswith((".md", ".txt"))):
            if PurePosixPath(relative.as_posix()) == PINK_EXAMPLE_MOC:
                try:
                    evidence = validate_pink_example_exception(root)
                    report.setdefault("authorizedRuntimeExceptions", []).append(evidence)
                except (ValidationError, OSError, ValueError) as exc:
                    issue(report, "redistribution", str(exc), relative.as_posix())
            else:
                issue(report, "redistribution", "Generated model, SDK binary, or model weight must not be committed; provide acquisition instructions instead.", relative.as_posix())
        if lower.startswith("codex-clipboard-") or lower in {"master-original.png", "master-front-v3.png"}:
            issue(report, "private_art", "Possible private character/reference artwork", relative.as_posix())
        if path.suffix.lower() not in text_suffixes:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        if private.search(content):
            issue(report, "private_path", "Found a personal absolute home/volume path", relative.as_posix())
        if path.suffix.lower() == ".md":
            for link in document_links(content):
                if link.startswith("#") or urllib.parse.urlsplit(link).scheme or link.startswith("//"):
                    continue
                target_text = urllib.parse.unquote(link.split("#", 1)[0].split("?", 1)[0])
                if not target_text or any(part in ignored for part in PurePosixPath(target_text).parts):
                    continue
                target = (path.parent / target_text).resolve()
                try:
                    target.relative_to(root)
                except ValueError:
                    issue(report, "link_escape", f"Relative document link escapes checkout: {link}", relative.as_posix())
                    continue
                if not target.exists():
                    issue(report, "broken_link", f"Missing relative link target: {link}", relative.as_posix())
    report["checkedFiles"] = checked
    issue(report, "manual_media_review", "Filename/extension checks cannot determine image ownership or detect every embedded secret; review staged files before publishing.", warning=True)
    report["passed"] = not report["errors"]
    return report


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--manifest", type=Path)
    mode.add_argument("--model", type=Path)
    mode.add_argument("--kit", action="store_true")
    parser.add_argument("--core-report", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    if args.core_report and not args.model:
        parser.error("--core-report applies only to --model")
    if args.manifest:
        report = validate_manifest(args.manifest)
    elif args.model:
        report = validate_model(args.model, args.core_report)
    else:
        report = validate_kit(Path(__file__).resolve().parents[1])
    serialized = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
    print(serialized, end="")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
