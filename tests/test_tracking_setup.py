"""Installer fixtures check byte integrity and safe paths, not model inference."""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("setup_tracking", ROOT / "scripts/setup-tracking.py")
SETUP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SETUP)


def dependency(data=b"verified fixture bytes", path="wasm/runtime.wasm"):
    return {"path": path, "url": "https://cdn.jsdelivr.net/npm/example@1.0.0/fixture",
            "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


class Response(io.BytesIO):
    def __init__(self, data, url="https://cdn.jsdelivr.net/npm/example@1.0.0/fixture"):
        super().__init__(data)
        self.url = url

    def geturl(self):
        return self.url


class TrackingSetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.lock = {"schemaVersion": 1, "files": [dependency()]}

    def load(self, lock):
        path = self.root / "lock.json"
        path.write_text(json.dumps(lock), encoding="utf-8")
        return SETUP.load_lock(path)

    def test_missing_verify_is_read_only_and_performs_no_network(self):
        output = self.root / "absent"
        with patch.object(SETUP.urllib.request, "urlopen", side_effect=AssertionError("network forbidden")):
            report = SETUP.setup(output, self.load(self.lock), verify_only=True)
        self.assertFalse(report["passed"])
        self.assertFalse(output.exists())
        self.assertEqual(report["networkRequests"], 0)
        self.assertEqual(report["missingOrMismatched"], ["wasm/runtime.wasm"])

    def test_verify_checks_exact_bytes_and_ignores_unlisted_files(self):
        target = self.root / "wasm/runtime.wasm"
        target.parent.mkdir()
        target.write_bytes(b"verified fixture bytes")
        extra = self.root / "unrelated.txt"
        extra.write_text("keep", encoding="utf-8")
        report = SETUP.setup(self.root, self.load(self.lock), verify_only=True)
        self.assertTrue(report["passed"])
        self.assertEqual(len(report["files"]), 1)
        target.write_bytes(b"corruptd fixture bytes")
        report = SETUP.setup(self.root, self.load(self.lock), verify_only=True)
        self.assertFalse(report["passed"])
        self.assertEqual(extra.read_text(), "keep")

    def test_download_is_verified_then_cached(self):
        with patch.object(SETUP.urllib.request, "urlopen", return_value=Response(b"verified fixture bytes")) as request:
            report = SETUP.setup(self.root, self.load(self.lock))
        self.assertTrue(report["passed"])
        self.assertEqual(report["downloaded"], ["wasm/runtime.wasm"])
        request.assert_called_once()
        with patch.object(SETUP.urllib.request, "urlopen", side_effect=AssertionError("cached download")):
            cached = SETUP.setup(self.root, self.load(self.lock))
        self.assertEqual(cached["downloaded"], [])
        self.assertEqual(cached["networkRequests"], 0)

    def test_bad_download_preserves_existing_bytes_and_removes_temporary_files(self):
        target = self.root / "wasm/runtime.wasm"
        target.parent.mkdir()
        target.write_bytes(b"older file")
        for data in [b"corruptd fixture bytes", b"short", b"x" * 100]:
            with self.subTest(data=data), patch.object(SETUP.urllib.request, "urlopen", return_value=Response(data)):
                with self.assertRaises(ValueError):
                    SETUP.setup(self.root, self.load(self.lock))
            self.assertEqual(target.read_bytes(), b"older file")
            self.assertEqual(list(target.parent.glob(".tracking-download-*")), [])

    def test_redirect_cannot_leave_the_approved_https_hosts(self):
        for url in ["https://example.com/fixture", "http://cdn.jsdelivr.net/fixture"]:
            with self.subTest(url=url), patch.object(SETUP.urllib.request, "urlopen", return_value=Response(b"verified fixture bytes", url)):
                with self.assertRaises(ValueError):
                    SETUP.setup(self.root, self.load(self.lock))
        self.assertFalse((self.root / "wasm/runtime.wasm").exists())

    def test_symlink_files_directories_and_selected_root_are_rejected(self):
        outside = self.root / "outside"
        outside.mkdir()
        source = outside / "runtime.wasm"
        source.write_bytes(b"verified fixture bytes")
        output = self.root / "output"
        output.mkdir()
        (output / "wasm").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError):
            SETUP.setup(output, self.load(self.lock), verify_only=True)
        (output / "wasm").unlink()
        (output / "wasm").mkdir()
        (output / "wasm/runtime.wasm").symlink_to(source)
        with self.assertRaises(ValueError):
            SETUP.setup(output, self.load(self.lock), verify_only=True)
        alias = self.root / "alias"
        alias.symlink_to(output, target_is_directory=True)
        with self.assertRaises(ValueError):
            SETUP.setup(alias, self.load(self.lock), verify_only=True)
        self.assertEqual(source.read_bytes(), b"verified fixture bytes")

    def test_lock_rejects_unsafe_unpinned_and_ambiguous_entries(self):
        invalid = []
        for field, value in [("path", "../escape"), ("path", "/absolute"), ("path", "a\\b"),
                             ("path", "a//b"), ("path", "a/./b"), ("bytes", True),
                             ("bytes", 0), ("sha256", "0" * 63), ("url", None),
                             ("url", "http://cdn.jsdelivr.net/file"),
                             ("url", "https://example.com/file"),
                             ("url", "https://user:pass@cdn.jsdelivr.net/file"),
                             ("url", "https://cdn.jsdelivr.net/npm/example@latest/file")]:
            lock = copy.deepcopy(self.lock)
            lock["files"][0][field] = value
            invalid.append(lock)
        for paths in [("a.bin", "A.bin"), ("wasm", "wasm/file.wasm")]:
            invalid.append({"schemaVersion": 1, "files": [dependency(path=path) for path in paths]})
        invalid.append({"schemaVersion": 1, "files": [None]})
        for lock in invalid:
            with self.subTest(lock=lock), self.assertRaises(ValueError):
                self.load(lock)

    def test_repository_lock_has_the_declared_runtime_and_models(self):
        lock = SETUP.load_lock(ROOT / "tools/tracking-dependencies.json")
        paths = {item["path"] for item in lock["files"]}
        self.assertEqual(lock["package"]["version"], "1.0.1")
        for key in ["visionModule", "faceModel", "poseModel"]:
            self.assertIn(lock["assets"][key], paths)
        self.assertIn(f"{lock['assets']['wasmRoot']}/vision_wasm_internal.wasm", paths)
        self.assertIn("notices/Apache-2.0.txt", paths)


if __name__ == "__main__":
    unittest.main()
