#!/usr/bin/env python3
"""Acquire pinned MediaPipe assets locally. --verify performs no network requests."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile
import urllib.parse
import urllib.request

KIT_ROOT = Path(__file__).resolve().parent.parent
ALLOWED_HOSTS = {"cdn.jsdelivr.net", "storage.googleapis.com", "www.apache.org"}


def load_lock(path: Path) -> dict:
    lock = json.loads(path.read_text(encoding="utf-8"))
    if lock.get("schemaVersion") != 1 or not isinstance(lock.get("files"), list) or not lock["files"]:
        raise ValueError("Invalid tracking dependency lock")
    seen = set()
    for entry in lock["files"]:
        if not isinstance(entry, dict):
            raise ValueError("Invalid dependency entry")
        relative = entry.get("path", "")
        if not isinstance(relative, str) or not relative or "\\" in relative or "\u0000" in relative:
            raise ValueError("Invalid dependency path")
        parsed = PurePosixPath(relative)
        if parsed.is_absolute() or any(p in {"", ".", ".."} for p in relative.split("/")):
            raise ValueError("Dependency paths must stay inside the selected directory")
        if relative.casefold() in seen:
            raise ValueError("Duplicate dependency path")
        seen.add(relative.casefold())
        if not re.fullmatch(r"[0-9a-f]{64}", str(entry.get("sha256", ""))):
            raise ValueError("Invalid dependency SHA-256")
        if not isinstance(entry.get("bytes"), int) or isinstance(entry["bytes"], bool) or not 0 < entry["bytes"] <= 100_000_000:
            raise ValueError("Invalid dependency byte count")
        if not isinstance(entry.get("url"), str):
            raise ValueError("Invalid dependency URL")
        url = urllib.parse.urlsplit(entry["url"])
        if url.scheme != "https" or url.hostname not in ALLOWED_HOSTS or url.username or url.password:
            raise ValueError("Dependency URL must use an approved official distribution host over HTTPS")
        if "latest" in url.path.split("/") or "@latest" in url.path:
            raise ValueError("Dependency URLs must pin versions")
    for path in seen:
        if any(str(parent) in seen for parent in PurePosixPath(path).parents if str(parent) != "."):
            raise ValueError("Dependency file conflicts with a parent directory")
    return lock


def safe_destination(root: Path, relative: str) -> Path:
    current = root
    for component in PurePosixPath(relative).parts:
        current = current / component
        if current.is_symlink():
            raise ValueError(f"Refusing symlink dependency path: {relative}")
    return current


def matches(path: Path, entry: dict) -> bool:
    if not path.is_file() or path.stat().st_size != entry["bytes"]:
        return False
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest() == entry["sha256"]


def download_verified(root: Path, entry: dict) -> None:
    target = safe_destination(root, entry["path"])
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".tracking-download-", dir=target.parent)
    temporary = Path(name)
    try:
        digest = hashlib.sha256()
        count = 0
        request = urllib.request.Request(entry["url"], headers={"User-Agent": "live2d-agent-kit-tracking-setup/1"})
        with os.fdopen(fd, "wb") as output, urllib.request.urlopen(request, timeout=45) as response:
            final = urllib.parse.urlsplit(response.geturl())
            if final.scheme != "https" or final.hostname not in ALLOWED_HOSTS:
                raise ValueError("Dependency redirected outside approved HTTPS distribution hosts")
            for block in iter(lambda: response.read(1024 * 1024), b""):
                count += len(block)
                if count > entry["bytes"]:
                    raise ValueError(f"Download exceeds pinned size: {entry['path']}")
                digest.update(block)
                output.write(block)
        if count != entry["bytes"] or digest.hexdigest() != entry["sha256"]:
            raise ValueError(f"Downloaded bytes do not match the pinned dependency: {entry['path']}")
        # Existing bytes survive a failed download. Replace only after full validation.
        safe_destination(root, entry["path"])
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def setup(directory: Path, lock: dict, *, verify_only: bool = False) -> dict:
    if directory.is_symlink():
        raise ValueError("The tracking directory itself must not be a symlink")
    root = directory.resolve()
    if not verify_only:
        root.mkdir(parents=True, exist_ok=True)
    checked, missing, downloaded = [], [], []
    for entry in lock["files"]:
        target = safe_destination(root, entry["path"])
        if not matches(target, entry):
            if verify_only:
                missing.append(entry["path"])
                continue
            download_verified(root, entry)
            downloaded.append(entry["path"])
        if not matches(target, entry):
            raise ValueError(f"Dependency changed during verification: {entry['path']}")
        checked.append({key: entry[key] for key in ["path", "bytes", "sha256"]})
    return {"passed": not missing, "package": lock.get("package", {}), "files": checked,
            "missingOrMismatched": missing, "downloaded": downloaded,
            "networkRequests": 0 if verify_only else len(downloaded),
            "scope": "Exact local JS/WASM/model bytes only; no camera access or inference test."}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=KIT_ROOT / ".cache" / "mediapipe")
    parser.add_argument("--lock", type=Path, default=KIT_ROOT / "tools" / "tracking-dependencies.json")
    parser.add_argument("--verify", action="store_true", help="Verify exact local files without downloading or modifying them")
    args = parser.parse_args()
    try:
        report = setup(args.directory, load_lock(args.lock), verify_only=args.verify)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["passed"] else 1
    except (OSError, ValueError, KeyError) as exc:
        print(f"Tracking dependency setup failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
