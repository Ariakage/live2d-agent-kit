#!/usr/bin/env python3
"""Check committed recipe sources in a temporary git archive, without old caches.

Requires Python 3.10+, Git, Node.js 22+ and JDK 21. This offline check does not
compile psd2live, download dependencies, export a MOC, upscale, or validate Core.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tarfile
import tempfile


def unpack_source(archive, destination):
    """Materialize regular archive entries only, without following link targets."""
    destination = Path(destination).resolve()
    with tarfile.open(archive) as source:
        for member in source:
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts:
                raise ValueError(f"Unsafe archive member: {member.name}")
            target = destination.joinpath(*name.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.extractfile(member) as stream:
                    target.write_bytes(stream.read())
                target.chmod(member.mode & 0o777)
            else:
                raise ValueError(f"Non-regular archive member: {member.name}")


def manifest_sources(manifest_path, package_root):
    """Verify that every image dependency resolves inside this source package."""
    manifest_path, package_root = Path(manifest_path), Path(package_root).resolve()
    manifest = json.loads(manifest_path.read_text())
    references = []
    for layer in manifest["layers"]:
        references.append(layer["path"])
        fill = layer.get("source_hole_fill_image")
        if fill:
            references.append(fill["path"])
    references += manifest.get("config", {}).get("export_texture_pages", [])
    files = {}
    for reference in references:
        path = (manifest_path.parent / reference).resolve()
        if not path.is_relative_to(package_root):
            raise ValueError(f"Manifest dependency escapes archive: {reference}")
        if not path.is_file():
            raise ValueError(f"Missing manifest dependency: {reference}")
        files[path.relative_to(package_root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"layers": len(manifest["layers"]), "sources": files,
            "manifestSha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--ref", default="HEAD", help="Committed ref to archive; uncommitted changes are excluded")
    parser.add_argument("--java", default="java", help="JDK 21 java executable")
    parser.add_argument("--node", default="node", help="Node.js 22+ executable")
    parser.add_argument("--report", type=Path, help="Optional JSON report outside the temporary archive")
    args = parser.parse_args()
    report = {"schemaVersion": 1, "passed": False, "checks": [],
              "cleanEngineBuildValidated": False, "nativeCoreValidated": False,
              "scope": "Committed source package, offline tests, source-to-manifest regeneration; no exporter or runtime execution."}
    try:
        repo = args.repository.resolve()
        commit = subprocess.check_output(["git", "rev-parse", "--verify", args.ref + "^{commit}"], cwd=repo, text=True).strip()
        report["commit"] = commit
        with tempfile.TemporaryDirectory(prefix="live2d-kit-source-check-") as temporary:
            temporary = Path(temporary)
            archive, root = temporary / "source.tar", temporary / "kit"
            subprocess.run(["git", "archive", "--format=tar", "--output", str(archive), commit], cwd=repo, check=True)
            root.mkdir()
            unpack_source(archive, root)
            initial = {name: (root / name).exists() for name in ("work", ".cache", "outputs", "dist")}
            report["initialGeneratedDirectoriesPresent"] = initial
            if any(initial.values()):
                raise ValueError("Archive unexpectedly contains generated/cache directories")

            def run(label, command, json_output=False):
                environment = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", VALIDATOR_JAVA=args.java)
                # The archive is the only Python/Node project source root.
                environment.pop("PYTHONPATH", None)
                environment.pop("NODE_PATH", None)
                result = subprocess.run(command, cwd=root, env=environment, text=True, capture_output=True)
                item = {"name": label, "passed": result.returncode == 0}
                if result.returncode:
                    item["outputTail"] = (result.stdout + result.stderr)[-4000:]
                elif json_output:
                    payload = json.loads(result.stdout)
                    item.update(passed=payload["passed"], warnings=len(payload.get("warnings", [])))
                elif label == "unit-tests":
                    item["summary"] = result.stderr.strip().splitlines()[-3:]
                report["checks"].append(item)
                if not item["passed"]:
                    raise ValueError(f"Check failed: {label}")

            run("unit-tests", [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"])
            browser_tests = sorted((root / "tests").glob("test_*.cjs"))
            if browser_tests:
                run("tracking-unit-tests", [args.node, "--test", *[str(p.relative_to(root)) for p in browser_tests]])
            run("kit", [sys.executable, "scripts/validate.py", "--kit"], True)
            brow_script = root / "examples/pink-sakura/prepare-brows.cjs"
            if brow_script.is_file():
                run("pink-brow-preparation", [args.node, str(brow_script.relative_to(root)), "work/pink-brows"])
                report["browSources"] = []
                for name in ("eyebrow-base-v1.png", "eyebrow-l-v1.png", "eyebrow-r-v1.png"):
                    generated = root / "work/pink-brows" / name
                    published = root / "examples/pink-sakura/source" / name
                    actual = hashlib.sha256(generated.read_bytes()).hexdigest()
                    expected = hashlib.sha256(published.read_bytes()).hexdigest()
                    report["browSources"].append({"file": name, "sha256": actual, "matchesPublished": actual == expected})
                    if actual != expected:
                        raise ValueError(f"Regenerated eyebrow source differs: {name}")
            run("pink-recipe", [args.node, "examples/pink-sakura/build-manifest.cjs"])
            pink = root / "examples/pink-sakura/manifest.json"
            report["pink"] = manifest_sources(pink, root)
            provenance = json.loads((pink.parent / "source-provenance.json").read_text())
            recorded = provenance["final_evidence"]["public_recipe_rebuild"]["manifest_sha256"]
            report["pink"]["matchesRecordedManifest"] = report["pink"]["manifestSha256"] == recorded
            if not report["pink"]["matchesRecordedManifest"]:
                raise ValueError("Pink recipe differs from its recorded manifest fingerprint")
            run("pink-manifest", [sys.executable, "scripts/validate.py", "--manifest", str(pink)], True)
            run("minimal-generation", [args.java, "--source", "21", "examples/minimal-model/GenerateExample.java", "work/minimal/assets"])
            minimal = root / "work/minimal/assets/manifest.json"
            report["minimal"] = manifest_sources(minimal, root)
            run("minimal-manifest", [sys.executable, "scripts/validate.py", "--manifest", str(minimal)], True)
            lock = json.loads((root / "integrations/psd2live/engine-lock.json").read_text())
            patch_sha = hashlib.sha256((root / "patches/psd2live-agent-kit.patch").read_bytes()).hexdigest()
            if patch_sha != lock["patch_sha256"]:
                raise ValueError("Published engine patch differs from its lock")
            report["engineSourceRecipe"] = {"url": lock["url"], "commit": lock["commit"],
                                            "patchSha256": patch_sha, "patchedFiles": len(lock["patched_files"])}
            report["passed"] = True
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as exc:
        report["error"] = str(exc)
    body = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(body)
    print(body, end="")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
