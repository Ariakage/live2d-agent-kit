"""Structural synthetic fixtures only. These bytes are NOT usable Live2D models."""

import importlib.util
import json
import struct
import sys
import tempfile
import unittest
import zipfile
import zlib
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import validate

spec = importlib.util.spec_from_file_location("package_model", SCRIPTS / "package-model.py")
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)


def png_bytes(width=8, height=8):
    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff)
    pixels = (b"\0" + b"\xff\x80\x40\xff" * width) * height
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b""))


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.model_root = self.root / "runtime"
        self.model_root.mkdir()
        # Deliberately synthetic, only sufficient for structural header tests; never run in Core.
        (self.model_root / "demo.moc3").write_bytes(b"MOC3\x05\0\0\0" + b"STRUCTURAL-FIXTURE-NOT-A-MODEL" * 4)
        (self.model_root / "texture.png").write_bytes(png_bytes())
        (self.model_root / "idle.motion3.json").write_text('{"Version":3}', encoding="utf-8")
        (self.model_root / "blink.exp3.json").write_text('{"Type":"Live2D Expression"}', encoding="utf-8")
        self.model = self.model_root / "demo.model3.json"
        self.data = {"Version": 3, "FileReferences": {"Moc": "demo.moc3", "Textures": ["texture.png"],
                     "Motions": {"Idle": [{"File": "idle.motion3.json"}]},
                     "Expressions": [{"Name": "Blink", "File": "blink.exp3.json"}]}}
        self.write_model()
        self.manifest = self.root / "manifest.json"
        self.manifest_data = {"name": "PrimitiveFixture", "width": 8, "height": 8,
                              "layers": [{"name": "face", "path": "runtime/texture.png", "crop": [0, 0, 8, 8],
                                          "source_polygons": [[[0, 0], [8, 0], [8, 8], [0, 8]]]}]}
        self.write_manifest()

    def tearDown(self):
        self.temp.cleanup()

    def write_model(self):
        self.model.write_text(json.dumps(self.data), encoding="utf-8")

    def write_manifest(self):
        self.manifest.write_text(json.dumps(self.manifest_data), encoding="utf-8")

    def make_report_fixture(self, **overrides):
        # Tests matching logic only; this report is explicitly fabricated test evidence.
        data = {"validator": "local-official-cubism-core", "passed": True,
                "sha256": validate.sha256(self.model_root / "demo.moc3"),
                "testFixture": "Fabricated for unit tests; Core has not run."}
        data.update(overrides)
        path = self.root / "synthetic-core-report.json"
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def test_structural_success_never_claims_core_without_report(self):
        result = validate.validate_model(self.model)
        self.assertTrue(result["passed"])
        self.assertFalse(result["nativeCoreValidated"])
        self.assertEqual(len(result["files"]), 4)

    def test_missing_texture_fails(self):
        (self.model_root / "texture.png").unlink()
        result = validate.validate_model(self.model)
        self.assertFalse(result["passed"])
        self.assertTrue(any("texture.png" in e["message"] for e in result["errors"]))

    def test_eight_byte_placeholder_fails(self):
        (self.model_root / "demo.moc3").write_bytes(b"MOC3\x05\0\0\0")
        result = validate.validate_model(self.model)
        self.assertFalse(result["passed"])
        self.assertTrue(any("placeholder" in e["message"] for e in result["errors"]))

    def test_bad_png_header_fails(self):
        (self.model_root / "texture.png").write_bytes(b"not a texture")
        self.assertFalse(validate.validate_model(self.model)["passed"])

    def test_runtime_path_traversal_absolute_and_urls_fail(self):
        (self.root / "outside.png").write_bytes(png_bytes())
        paths = ["../outside.png", "child/../texture.png", str(self.root / "outside.png"),
                 "https://example.test/texture.png", "file:///tmp/texture.png", "C:\\outside.png",
                 "..\\outside.png", "%2e%2e/outside.png"]
        for path in paths:
            with self.subTest(path=path):
                self.data["FileReferences"]["Textures"] = [path]
                self.write_model()
                self.assertFalse(validate.validate_model(self.model)["passed"])

    def test_runtime_symlink_escape_fails(self):
        outside = self.root / "external.png"
        outside.write_bytes(png_bytes())
        link = self.model_root / "link.png"
        try:
            link.symlink_to(outside)
        except OSError:
            self.skipTest("Creating symlinks is not permitted on this platform")
        self.data["FileReferences"]["Textures"] = ["link.png"]
        self.write_model()
        result = validate.validate_model(self.model)
        self.assertFalse(result["passed"])
        self.assertTrue(any("symlink" in e["message"] for e in result["errors"]))

    def test_motion_sound_and_optional_references_are_checked(self):
        self.data["FileReferences"]["Motions"]["Idle"][0]["Sound"] = "missing.wav"
        self.data["FileReferences"]["UserData"] = "missing.userdata3.json"
        self.write_model()
        result = validate.validate_model(self.model)
        self.assertFalse(result["passed"])
        self.assertEqual(len(result["errors"]), 2)

    def test_core_report_exact_sha_validator_and_pass_required(self):
        for override in ({"sha256": "0" * 64}, {"validator": "file-header-check"}, {"passed": False}):
            with self.subTest(override=override):
                result = validate.validate_model(self.model, self.make_report_fixture(**override))
                self.assertFalse(result["passed"])
                self.assertFalse(result["nativeCoreValidated"])
        good = validate.validate_model(self.model, self.make_report_fixture())
        self.assertTrue(good["passed"])
        self.assertTrue(good["nativeCoreValidated"])
        self.assertIn("not rerun", good["nativeCoreEvidence"]["source"])

    def test_manifest_source_bounds_and_finite_numbers(self):
        self.assertTrue(validate.validate_manifest(self.manifest)["passed"])
        for change in ({"crop": [0, 0, 9, 8]}, {"source_alpha_holes": [[[0, 0], [9, 0], [0, 1]]]},
                       {"x": float("nan")}, {"w": False}):
            with self.subTest(change=change):
                original = dict(self.manifest_data["layers"][0])
                self.manifest_data["layers"][0].update(change)
                self.write_manifest()
                self.assertFalse(validate.validate_manifest(self.manifest)["passed"])
                self.manifest_data["layers"][0] = original

    def test_manifest_external_local_assets_supported_with_warning(self):
        self.manifest_data["layers"][0]["path"] = str(self.model_root / "texture.png")
        self.manifest_data["layers"][0]["x"] = -12  # Legitimate off-canvas overlap.
        self.write_manifest()
        result = validate.validate_manifest(self.manifest)
        self.assertTrue(result["passed"])
        self.assertTrue(any(w["code"] == "nonportable_asset" for w in result["warnings"]))

    def test_manifest_documented_canvas_aliases_and_scale(self):
        self.manifest_data["canvas_width"] = self.manifest_data.pop("width")
        self.manifest_data["canvas_height"] = self.manifest_data.pop("height")
        self.manifest_data["layers"][0]["scale"] = 0.5
        self.write_manifest()
        self.assertTrue(validate.validate_manifest(self.manifest)["passed"])
        self.manifest_data["layers"][0]["scale"] = 0
        self.write_manifest()
        self.assertFalse(validate.validate_manifest(self.manifest)["passed"])
        self.manifest_data["layers"][0]["scale"] = 1
        self.manifest_data["layers"][0]["opacity"] = 2
        self.write_manifest()
        self.assertFalse(validate.validate_manifest(self.manifest)["passed"])

    def test_green_despill_warns_but_does_not_modify_recipe(self):
        self.manifest_data["neutral_green_despill"] = True
        self.write_manifest()
        before = self.manifest.read_bytes()
        result = validate.validate_manifest(self.manifest)
        self.assertTrue(result["passed"])
        self.assertTrue(any(w["code"] == "green_matte_review" for w in result["warnings"]))
        self.assertEqual(before, self.manifest.read_bytes())

    def test_duplicate_json_key_rejected(self):
        self.model.write_text('{"Version":3,"Version":3}', encoding="utf-8")
        self.assertFalse(validate.validate_model(self.model)["passed"])

    def test_packager_copies_only_dependencies_and_matches_zip(self):
        (self.model_root / "private-unused.txt").write_text("Do not distribute", encoding="utf-8")
        output = self.root / "bundle"
        result = packager.package_model(self.model, self.make_report_fixture(), output)
        self.assertTrue(result["passed"])
        self.assertFalse((output / "private-unused.txt").exists())
        metadata = json.loads((output / "release-metadata.json").read_text())
        self.assertFalse(metadata["vtubeStudioTested"])
        self.assertEqual(len(metadata["files"]), 5)
        with zipfile.ZipFile(result["zip"]) as archive:
            self.assertIsNone(archive.testzip())
            for name in archive.namelist():
                self.assertEqual(archive.read(name), (output / name).read_bytes())

    def test_packager_refuses_nonempty_output_and_wrong_core_evidence(self):
        output = self.root / "bundle"
        output.mkdir()
        sentinel = output / "keep.txt"
        sentinel.write_text("keep", encoding="utf-8")
        with self.assertRaises(validate.ValidationError):
            packager.package_model(self.model, self.make_report_fixture(), output)
        self.assertEqual(sentinel.read_text(), "keep")
        with self.assertRaises(validate.ValidationError):
            packager.package_model(self.model, self.make_report_fixture(sha256="1" * 64), self.root / "new-bundle")
        self.assertFalse((self.root / "new-bundle").exists())

    def test_packager_rejects_referenced_sdk_binary(self):
        (self.model_root / "sdk.dll").write_bytes(b"not distributable")
        self.data["FileReferences"]["UserData"] = "sdk.dll"
        self.write_model()
        with self.assertRaises(validate.ValidationError):
            packager.package_model(self.model, self.make_report_fixture(), self.root / "bad-bundle")

    def test_kit_checks_links_and_ignores_work(self):
        kit = self.root / "kit"
        kit.mkdir()
        (kit / "README.md").write_text("[Missing](missing.md)\n[Output](work/demo.moc3)\n[Web](https://example.test)\n", encoding="utf-8")
        (kit / "work").mkdir()
        (kit / "work" / "generated.moc3").write_bytes(b"generated output")
        result = validate.validate_kit(kit)
        self.assertFalse(result["passed"])
        self.assertEqual([e["code"] for e in result["errors"]], ["broken_link"])


if __name__ == "__main__":
    unittest.main()
