"""Structural synthetic fixtures only. These bytes are NOT usable Live2D models."""

import importlib.util
import json
import struct
import sys
import tempfile
import unittest
from unittest import mock
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

    def test_packager_optional_credits_have_exact_hashes_in_metadata_and_zip(self):
        attribution = self.root / "credits.txt"
        license_file = self.root / "asset-license.md"
        attribution.write_text("# Attribution\nArtist and tool credits.\n", encoding="utf-8")
        license_file.write_text("# Asset terms\nA synthetic license notice for this test.\n", encoding="utf-8")
        for include_attribution, include_license in ((False, False), (True, False), (False, True), (True, True)):
            with self.subTest(attribution=include_attribution, license=include_license):
                output = self.root / f"credits-bundle-{include_attribution}-{include_license}"
                result = packager.package_model(self.model, self.make_report_fixture(), output,
                                               attribution=attribution if include_attribution else None,
                                               asset_license=license_file if include_license else None)
                metadata = json.loads((output / "release-metadata.json").read_text())
                self.assertEqual(result["runtimeFiles"], 5)
                self.assertEqual(result["packagedFiles"], 5 + include_attribution + include_license)
                with zipfile.ZipFile(result["zip"]) as archive:
                    for key, included, source, destination in (("attribution", include_attribution, attribution, "ATTRIBUTION.md"),
                                                               ("assetLicense", include_license, license_file, "ASSET-LICENSE.md")):
                        self.assertEqual(metadata[key]["included"], included)
                        self.assertEqual(metadata[key]["path"], destination if included else None)
                        if included:
                            digest = validate.sha256(source)
                            self.assertEqual(metadata[key]["sha256"], digest)
                            self.assertEqual(metadata["files"][destination]["sha256"], digest)
                            self.assertEqual((output / destination).read_bytes(), source.read_bytes())
                            self.assertEqual(archive.read(destination), source.read_bytes())
                        else:
                            self.assertNotIn(destination, metadata["files"])
                            self.assertNotIn(destination, archive.namelist())

    def test_packager_rejects_missing_empty_or_nontext_publication_documents(self):
        inputs = {"missing.md": None, "empty.md": b"", "whitespace.txt": b" \t\n",
                  "invalid.md": b"\xff\xfe", "binary.md": b"header\0payload", "script.js": b"plain text"}
        for keyword in ("attribution", "asset_license"):
            for name, data in inputs.items():
                with self.subTest(keyword=keyword, file=name):
                    source = self.root / name
                    if data is not None:
                        source.write_bytes(data)
                    output = self.root / f"bad-doc-{keyword}-{name}"
                    with self.assertRaises(validate.ValidationError):
                        packager.package_model(self.model, self.make_report_fixture(), output, **{keyword: source})
                    self.assertFalse(output.exists())
                    self.assertFalse(output.with_name(output.name + ".zip").exists())

    def test_packager_publication_names_cannot_collide_with_dependencies(self):
        document = self.root / "publication.txt"
        document.write_text("Test publication text\n", encoding="utf-8")
        collisions = (("attribution", "ATTRIBUTION.md"), ("attribution", "attribution.MD"),
                      ("attribution", "Attribution.md/child.json"),
                      ("asset_license", "ASSET-LICENSE.md"), ("asset_license", "asset-license.MD"),
                      ("asset_license", "Asset-License.md/child.json"))
        for index, (keyword, reference) in enumerate(collisions):
            with self.subTest(keyword=keyword, reference=reference):
                dependency = self.model_root / reference
                dependency.parent.mkdir(parents=True, exist_ok=True)
                dependency.write_text("{}", encoding="utf-8")
                self.data["FileReferences"]["UserData"] = reference
                self.write_model()
                output = self.root / f"colliding-bundle-{index}"
                with self.assertRaisesRegex(validate.ValidationError, "reserved publication path"):
                    packager.package_model(self.model, self.make_report_fixture(), output, **{keyword: document})
                self.assertFalse(output.exists())
                dependency.unlink()

    def test_packager_rejects_publication_text_changed_after_validation(self):
        document = self.root / "publication.txt"
        document.write_text("Validated text\n", encoding="utf-8")
        copy = packager.shutil.copyfile

        def changed_copy(source, destination):
            if source == document.resolve():
                document.write_text("Different text after validation\n", encoding="utf-8")
            return copy(source, destination)

        output = self.root / "changed-credits"
        with mock.patch.object(packager.shutil, "copyfile", side_effect=changed_copy):
            with self.assertRaisesRegex(validate.ValidationError, "Input changed after validation: ATTRIBUTION.md"):
                packager.package_model(self.model, self.make_report_fixture(), output, attribution=document)
        self.assertFalse(output.exists())
        self.assertFalse(output.with_name(output.name + ".zip").exists())

    def test_kit_checks_links_and_ignores_work(self):
        kit = self.root / "kit"
        kit.mkdir()
        (kit / "README.md").write_text("[Missing](missing.md)\n[Output](work/demo.moc3)\n[Web](https://example.test)\n", encoding="utf-8")
        (kit / "work").mkdir()
        (kit / "work" / "generated.moc3").write_bytes(b"generated output")
        result = validate.validate_kit(kit)
        self.assertFalse(result["passed"])
        self.assertEqual([e["code"] for e in result["errors"]], ["broken_link"])

    def test_kit_checks_links_in_and_to_tools(self):
        kit = self.root / "kit"
        tools = kit / "tools"
        tools.mkdir(parents=True)
        (kit / "README.md").write_text("[Catalog](tools/README.md)\n[Missing tool](tools/missing.md)\n", encoding="utf-8")
        (tools / "README.md").write_text("[Home](../README.md)\n[Missing guide](missing-guide.md)\n", encoding="utf-8")
        result = validate.validate_kit(kit)
        self.assertFalse(result["passed"])
        self.assertEqual([e["code"] for e in result["errors"]], ["broken_link", "broken_link"])
        self.assertEqual(result["checkedFiles"], 2)

    def test_kit_checks_redistribution_and_private_paths_in_tools(self):
        kit = self.root / "kit"
        tools = kit / "tools"
        tools.mkdir(parents=True)
        (tools / "model.bin").write_bytes(b"not a distributable weight")
        private_path = "/" + "Users" + "/example/private-art.png"
        (tools / "catalog.json").write_text(json.dumps({"path": private_path}), encoding="utf-8")
        result = validate.validate_kit(kit)
        self.assertFalse(result["passed"])
        self.assertEqual({e["code"] for e in result["errors"]}, {"redistribution", "private_path"})
        self.assertEqual(result["checkedFiles"], 2)

    def make_authorized_example_kit(self):
        kit = self.root / "example-kit"
        example = kit / "examples" / "pink-sakura"
        runtime = example / "runtime"
        runtime.mkdir(parents=True)
        (example / "LICENSE.md").write_text("Synthetic fixture license notice.\n", encoding="utf-8")
        (example / "ATTRIBUTION.md").write_text("Synthetic fixture attribution.\n", encoding="utf-8")
        # These bytes test ONLY the publication policy and header checks, never native validity.
        (runtime / "PinkSakura.moc3").write_bytes(b"MOC3\x05\0\0\0" + b"NOT-A-NATIVE-MODEL-TEST-FIXTURE" * 4)
        (runtime / "texture.png").write_bytes(png_bytes())
        model = {"Version": 3, "FileReferences": {"Moc": "PinkSakura.moc3", "Textures": ["texture.png"]}}
        (runtime / "PinkSakura.model3.json").write_text(json.dumps(model), encoding="utf-8")
        return kit, example, runtime

    def test_kit_accepts_only_documented_exact_example_without_core_claim(self):
        kit, _, _ = self.make_authorized_example_kit()
        result = validate.validate_kit(kit)
        self.assertTrue(result["passed"], result["errors"])
        self.assertFalse(result["nativeCoreValidated"])
        self.assertEqual(len(result["authorizedRuntimeExceptions"]), 1)
        evidence = result["authorizedRuntimeExceptions"][0]
        self.assertEqual(evidence["path"], "examples/pink-sakura/runtime/PinkSakura.moc3")
        self.assertEqual(evidence["validation"], "structural-only")
        self.assertFalse(evidence["nativeCoreValidated"])

    def test_kit_example_requires_license_attribution_and_model_json(self):
        kit, example, runtime = self.make_authorized_example_kit()
        for required in (example / "LICENSE.md", example / "ATTRIBUTION.md", runtime / "PinkSakura.model3.json"):
            contents = required.read_bytes()
            for empty in (False, True):
                with self.subTest(file=required.name, empty=empty):
                    if empty:
                        required.write_bytes(b"")
                    else:
                        required.unlink()
                    result = validate.validate_kit(kit)
                    self.assertFalse(result["passed"])
                    self.assertTrue(any(e["code"] == "redistribution" and required.name in e["message"] for e in result["errors"]))
                    self.assertNotIn("authorizedRuntimeExceptions", result)
                    required.write_bytes(contents)

    def test_kit_example_rejects_placeholder_and_broken_runtime_resources(self):
        kit, _, runtime = self.make_authorized_example_kit()
        changes = ((runtime / "PinkSakura.moc3", b"MOC3\x05\0\0\0"),
                   (runtime / "texture.png", b"invalid PNG"),
                   (runtime / "PinkSakura.model3.json", b'{"Version":2}'))
        for file, invalid in changes:
            with self.subTest(file=file.name):
                original = file.read_bytes()
                file.write_bytes(invalid)
                result = validate.validate_kit(kit)
                self.assertFalse(result["passed"])
                self.assertNotIn("authorizedRuntimeExceptions", result)
                file.write_bytes(original)
        (runtime / "texture.png").unlink()
        self.assertFalse(validate.validate_kit(kit)["passed"])

    def test_kit_example_model_json_must_reference_exact_authorized_moc(self):
        kit, _, runtime = self.make_authorized_example_kit()
        other = runtime / "Other.moc3"
        other.write_bytes((runtime / "PinkSakura.moc3").read_bytes())
        model_path = runtime / "PinkSakura.model3.json"
        model = json.loads(model_path.read_text())
        model["FileReferences"]["Moc"] = other.name
        model_path.write_text(json.dumps(model), encoding="utf-8")
        result = validate.validate_kit(kit)
        self.assertFalse(result["passed"])
        self.assertNotIn("authorizedRuntimeExceptions", result)
        self.assertTrue(any("exact PinkSakura.moc3" in e["message"] for e in result["errors"]))

    def test_kit_example_does_not_allow_neighbor_models_sdk_or_weights(self):
        kit, example, runtime = self.make_authorized_example_kit()
        forbidden = (runtime / "Neighbor.moc3", runtime / "PinkSakura.cmo3",
                     example / "PinkSakura.moc3", runtime / "weights.bin", runtime / "weights.param",
                     runtime / "weights.safetensors", runtime / "weights.onnx", runtime / "sdk.jar",
                     runtime / "live2dcubismcore.min.js", kit / "Elsewhere.moc3")
        for file in forbidden:
            with self.subTest(file=str(file.relative_to(kit))):
                file.write_bytes(b"FORBIDDEN TEST FIXTURE")
                result = validate.validate_kit(kit)
                self.assertFalse(result["passed"])
                self.assertTrue(any(e["code"] == "redistribution" and e["location"] == file.relative_to(kit).as_posix() for e in result["errors"]))
                file.unlink()

    def test_kit_example_cannot_borrow_companions_via_symlinks(self):
        kit, example, runtime = self.make_authorized_example_kit()
        for file in (example / "LICENSE.md", example / "ATTRIBUTION.md", runtime / "PinkSakura.model3.json", runtime / "PinkSakura.moc3"):
            with self.subTest(file=file.name):
                original = file.read_bytes()
                outside = self.root / "linked-companion.txt"
                outside.write_bytes(original)
                file.unlink()
                try:
                    file.symlink_to(outside)
                except OSError:
                    file.write_bytes(original)
                    self.skipTest("Creating symlinks is not permitted on this platform")
                result = validate.validate_kit(kit)
                self.assertFalse(result["passed"])
                self.assertNotIn("authorizedRuntimeExceptions", result)
                file.unlink()
                file.write_bytes(original)

    def test_kit_example_wrong_filename_is_not_an_exception(self):
        kit, _, runtime = self.make_authorized_example_kit()
        original = runtime / "PinkSakura.moc3"
        wrong = runtime / "PinkSakura-copy.moc3"
        original.rename(wrong)
        result = validate.validate_kit(kit)
        self.assertFalse(result["passed"])
        self.assertNotIn("authorizedRuntimeExceptions", result)
        self.assertTrue(any(e["code"] == "redistribution" and e["location"].endswith("PinkSakura-copy.moc3") for e in result["errors"]))


if __name__ == "__main__":
    unittest.main()
