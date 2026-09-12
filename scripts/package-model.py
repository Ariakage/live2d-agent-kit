#!/usr/bin/env python3
"""Package a validated, self-contained runtime. Does not include editor sources or SDKs."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

from validate import ValidationError, load_json, model_references, safe_reference, sha256, validate_model


def publication_document(path: Path, label: str) -> tuple[Path, str]:
    """Validate explicitly selected local text; preserve its exact bytes when packaging."""
    source = Path(path).resolve()
    if not source.is_file() or source.suffix.lower() not in {".md", ".txt"}:
        raise ValidationError(f"{label} must be an existing .md or .txt file")
    try:
        data = source.read_bytes()
        content = data.decode("utf-8-sig")
    except (OSError, UnicodeError) as exc:
        raise ValidationError(f"{label} must be readable UTF-8 text: {exc}") from exc
    if not content.strip():
        raise ValidationError(f"{label} must not be empty or whitespace-only")
    if any((ord(char) < 32 and char not in "\t\r\n") or ord(char) == 127 for char in content):
        raise ValidationError(f"{label} contains non-text control characters")
    return source, hashlib.sha256(data).hexdigest()


def package_model(model_path: Path, core_report: Path, output: Path, *,
                  attribution: Path | None = None, asset_license: Path | None = None) -> dict:
    model_path = Path(model_path).resolve()
    output = Path(output).absolute()
    archive = output.with_name(output.name + ".zip")
    if output.is_symlink() or (output.exists() and (not output.is_dir() or any(output.iterdir()))):
        raise ValidationError(f"Output must be a new or empty directory: {output}")
    if archive.exists() or archive.is_symlink():
        raise ValidationError(f"Refusing to overwrite archive: {archive}")
    report = validate_model(model_path, core_report)
    if not report["passed"] or not report["nativeCoreValidated"]:
        errors = "; ".join(item["message"] for item in report["errors"])
        raise ValidationError("Runtime/Core-report validation failed: " + (errors or "missing exact Core evidence"))
    references = model_references(load_json(model_path))
    source_files = {model_path.name: model_path}
    expected_hashes = {model_path.name: report["modelJsonSha256"]}
    denied = {".dll", ".dylib", ".so", ".jar", ".js", ".bin", ".param", ".pth", ".pt", ".onnx", ".safetensors"}
    for reference in references.values():
        target = safe_reference(model_path.parent, reference)
        if target.suffix.lower() in denied or "live2dcubismcore" in target.name.lower():
            raise ValidationError(f"SDK, executable code, or model weights are not runtime model dependencies: {reference}")
        normalized = Path(reference).as_posix()
        source_files[normalized] = target
        expected_hashes[normalized] = report["files"][reference]["sha256"]
    runtime_names = set(source_files)
    publication = {}
    for key, path, destination in (("attribution", attribution, "ATTRIBUTION.md"),
                                   ("assetLicense", asset_license, "ASSET-LICENSE.md")):
        publication[key] = {"included": path is not None, "path": destination if path is not None else None}
        if path is None:
            continue
        reserved = destination.casefold()
        if any(name.casefold() == reserved or name.casefold().startswith(reserved + "/") for name in source_files):
            raise ValidationError(f"Runtime dependency conflicts with reserved publication path {destination}")
        source, digest = publication_document(path, key)
        source_files[destination] = source
        expected_hashes[destination] = digest
        publication[key]["sha256"] = digest
    if any(name.casefold() == "release-metadata.json" for name in source_files):
        raise ValidationError("Runtime dependency conflicts with reserved release-metadata.json")
    casefolded = [name.casefold() for name in source_files]
    if len(casefolded) != len(set(casefolded)):
        raise ValidationError("Runtime paths collide on case-insensitive filesystems")
    # A file path may not also be a parent directory required by another dependency.
    folded_names = set(casefolded)
    for name in source_files:
        if any(parent.as_posix().casefold() in folded_names for parent in Path(name).parents if str(parent) != "."):
            raise ValidationError(f"Runtime file/directory path conflict: {name}")
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".live2d-package-", dir=output.parent))
    temporary_zip = None
    try:
        files = {}
        for name, source in sorted(source_files.items()):
            # Resolve again: a changed input must not silently escape or replace the validated bytes.
            if name in runtime_names and name != model_path.name:
                safe_reference(model_path.parent, name)
            destination = stage / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            digest = sha256(destination)
            if digest != expected_hashes[name]:
                raise ValidationError(f"Input changed after validation: {name}")
            files[name] = {"sha256": digest, "bytes": destination.stat().st_size}
        metadata = {
            "schemaVersion": 1,
            "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "entry": model_path.name,
            "nativeCoreValidated": True,
            "coreEvidence": report["nativeCoreEvidence"],
            "mocSha256": report["mocSha256"],
            "files": files,
            "attribution": publication["attribution"],
            "assetLicense": publication["assetLicense"],
            "vtubeStudioTested": False,
            "officialEditorTested": False,
            "cameraAccessed": False,
            "scope": "Runtime dependencies copied after structural checks and exact supplied official-Core report matching; optional explicitly supplied publication text is byte-verified. No target-application acceptance or license-content validation is inferred.",
        }
        (stage / "release-metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        descriptor, zip_name = tempfile.mkstemp(prefix=".live2d-package-", suffix=".zip", dir=output.parent)
        os.close(descriptor)
        temporary_zip = Path(zip_name)
        with zipfile.ZipFile(temporary_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
            for file in sorted(stage.rglob("*")):
                if file.is_file():
                    bundle.write(file, arcname=file.relative_to(stage).as_posix())
        with zipfile.ZipFile(temporary_zip) as bundle:
            bad = bundle.testzip()
            if bad is not None:
                raise ValidationError(f"Archive CRC failed: {bad}")
        archive_sha = sha256(temporary_zip)
        # Recheck destinations after work; never replace a newly created nonempty directory.
        if output.exists():
            if not output.is_dir() or any(output.iterdir()) or output.is_symlink():
                raise ValidationError("Output changed during packaging; refusing to overwrite it")
            output.rmdir()
        if archive.exists() or archive.is_symlink():
            raise ValidationError("Archive appeared during packaging; refusing to overwrite it")
        stage.rename(output)
        # Link creation is exclusive; unlike rename(), it cannot overwrite an existing ZIP.
        os.link(temporary_zip, archive)
        temporary_zip.unlink()
        temporary_zip = None
        return {"passed": True, "output": str(output), "zip": str(archive),
                "zipSha256": archive_sha, "metadata": str(output / "release-metadata.json"),
                "runtimeFiles": len(runtime_names), "packagedFiles": len(files), "nativeCoreValidated": True,
                "vtubeStudioTested": False}
    finally:
        if stage.exists():
            shutil.rmtree(stage)
        if temporary_zip is not None:
            temporary_zip.unlink(missing_ok=True)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--core-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--attribution", type=Path, help="UTF-8 .md/.txt to include as ATTRIBUTION.md")
    parser.add_argument("--asset-license", type=Path, help="UTF-8 .md/.txt to include as ASSET-LICENSE.md")
    args = parser.parse_args(argv)
    try:
        result = package_model(args.model, args.core_report, args.output,
                               attribution=args.attribution, asset_license=args.asset_license)
    except (ValidationError, OSError) as exc:
        print(json.dumps({"passed": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
