"""File-identity fixtures; simulated processes do not validate neural or Core output."""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import zlib


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def load_script(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


preview = load_script("prepare_preview", "prepare-preview.py")
upscale = load_script("upscale_atlas", "upscale-atlas.py")


def png_bytes(width=8, height=8, rgba=(255, 0, 0, 255)):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress((b"\0" + bytes(rgba) * width) * height))
            + chunk(b"IEND", b""))


class PreviewIdentityTests(unittest.TestCase):
    def test_collisions_use_normalized_case_insensitive_destination_names(self):
        references = [("./model.model3.json",), ("Model.MODEL3.JSON",),
                      ("texture.png", "./texture.png"), ("parts/eye.png", "parts/EYE.png"),
                      ("model.model3.json/child.json",), ("Parts", "parts/eye.png")]
        for names in references:
            with self.subTest(names=names), self.assertRaisesRegex(ValueError, "collid|conflict"):
                preview.validate_destinations([(name, Path(name)) for name in names])

    def prepare(self, root, userdata):
        source = root / "source"
        source.mkdir()
        (source / "character.moc3").write_bytes(b"COPY-ONLY-FIXTURE-NOT-A-MODEL")
        (source / "textures").mkdir()
        (source / "textures" / "texture.png").write_bytes(png_bytes())
        user_data_path = source / userdata
        user_data_path.parent.mkdir(parents=True, exist_ok=True)
        user_data_path.write_text('{"Version":3,"UserData":[]}', encoding="utf-8")
        settings = {"Version": 3, "FileReferences": {"Moc": "character.moc3",
                    "Textures": ["textures/texture.png"], "UserData": userdata}}
        model = source / "Character.model3.json"
        model.write_text(json.dumps(settings), encoding="utf-8")
        vendor = root / "vendor"
        vendor.mkdir()
        for name in (*preview.VENDOR, "core.js"):
            (vendor / name).write_text("// Test fixture only; never execute.\n", encoding="utf-8")
        output = root / "output"
        argv = ["prepare-preview.py", "--model", str(model), "--output", str(output),
                "--cubism-core", str(vendor / "core.js"), "--vendor-dir", str(vendor)]
        return source, output, settings, argv

    def test_entry_alias_is_rejected_before_creating_preview(self):
        with tempfile.TemporaryDirectory() as directory:
            _, output, _, argv = self.prepare(Path(directory), "./model.model3.json")
            with mock.patch.object(sys, "argv", argv), self.assertRaisesRegex(ValueError, "collide"):
                preview.main()
            self.assertFalse(output.exists())

    def test_distinct_nested_references_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output, settings, argv = self.prepare(Path(directory), "metadata/data.userdata3.json")
            with mock.patch.object(sys, "argv", argv), contextlib.redirect_stdout(io.StringIO()):
                preview.main()
            self.assertEqual(json.loads((output / "model/model.model3.json").read_text()), settings)
            for name in preview.resources(settings):
                self.assertEqual((source / name).read_bytes(), (output / "model" / name).read_bytes())
            self.assertEqual(json.loads((output / "preview-manifest.json").read_text())["config"]["CAPTURE_HOLD_DEFAULTS"], [])

    def test_capture_hold_defaults_are_copied_to_runtime_config(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, output, _, argv = self.prepare(root, "metadata/data.userdata3.json")
            config = root / "config.json"
            ids = ["ParamEyeBallForm", "ParamOptionalCustomPhysics"]
            config.write_text(json.dumps({"captureHoldDefaults": ids}))
            with mock.patch.object(sys, "argv", [*argv, "--config", str(config)]), contextlib.redirect_stdout(io.StringIO()):
                preview.main()
            self.assertEqual(json.loads((output / "preview-manifest.json").read_text())["config"]["CAPTURE_HOLD_DEFAULTS"], ids)
            self.assertIn("export const CAPTURE_HOLD_DEFAULTS = " + json.dumps(ids) + ";", (output / "view-config.js").read_text())

    def test_malformed_capture_hold_defaults_fail_before_copying_assets(self):
        invalid = [None, "ParamEyeBallForm", {}, [""], ["  "], [1], [None], [["nested"]], ["same", "same"]]
        for value in invalid:
            with self.subTest(value=value), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                _, output, _, argv = self.prepare(root, "metadata/data.userdata3.json")
                config = root / "config.json"
                config.write_text(json.dumps({"captureHoldDefaults": value}))
                with mock.patch.object(sys, "argv", [*argv, "--config", str(config)]), self.assertRaisesRegex(ValueError, "captureHoldDefaults"):
                    preview.main()
                self.assertFalse(output.exists())


class UpscaleIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.export = self.root / "export"
        self.export.mkdir()
        self.textures = [self.export / f"page-{i}.png" for i in range(2)]
        for i, texture in enumerate(self.textures):
            texture.write_bytes(png_bytes(rgba=(255, i * 100, 0, 255)))
        self.original = [texture.read_bytes() for texture in self.textures]
        self.digests = [upscale.sha(texture) for texture in self.textures]
        (self.export / "Fixture.model3.json").write_text(json.dumps({
            "Version": 3, "FileReferences": {"Textures": [p.name for p in self.textures]}}), encoding="utf-8")
        self.manifest = self.root / "manifest.json"
        self.manifest.write_text(json.dumps({"name": "Fixture", "layers": []}), encoding="utf-8")
        self.binary = self.root / "simulated-ncnn"
        self.binary.write_text("SIMULATED PROCESS FIXTURE", encoding="utf-8")
        self.models = self.root / "models"
        self.models.mkdir()
        for extension in (".param", ".bin"):
            (self.models / ("fixture" + extension)).write_text("TEST FIXTURE, NOT A WEIGHT", encoding="utf-8")
        self.output = self.root / "output"
        self.argv = ["upscale-atlas.py", "--manifest", str(self.manifest), "--export", str(self.export),
                     "--output", str(self.output), "--binary", str(self.binary),
                     "--models", str(self.models), "--model", "fixture"]
        self.consumed = {"prepare": [], "combine": []}
        self.inferences = 0

    def run_fixture(self, during_inference=None):
        def simulated_process(command, **kwargs):
            # Only exercise the orchestration contract. No Java/NCNN/Core is run.
            if command[0] == str(self.binary):
                if during_inference:
                    during_inference(self.inferences)
                self.inferences += 1
                Path(command[command.index("-o") + 1]).write_bytes(png_bytes(32, 32))
            else:
                operation = "prepare" if "prepare" in command else "combine"
                source = Path(command[-2] if operation == "prepare" else command[-3])
                self.assertTrue(source.is_relative_to(self.output / "source-atlases"))
                self.consumed[operation].append(source.read_bytes())
                target = Path(command[-1])
                target.write_bytes(source.read_bytes() if operation == "prepare" else png_bytes(32, 32))
            return subprocess.CompletedProcess(command, 0)

        with mock.patch.object(sys, "argv", self.argv), \
             mock.patch.object(upscale.subprocess, "run", side_effect=simulated_process), \
             contextlib.redirect_stdout(io.StringIO()):
            upscale.main()

    def report(self):
        return json.loads((self.output / "upscale-report.json").read_text())

    def test_success_uses_identical_snapshots_for_rgb_alpha_and_recorded_hashes(self):
        self.run_fixture()
        report = self.report()
        self.assertTrue(report["complete"])
        self.assertEqual(self.consumed["prepare"], self.original)
        self.assertEqual(self.consumed["combine"], self.original)
        self.assertEqual([p["source_sha256"] for p in report["pages"]], self.digests)
        hd = json.loads((self.output / "manifest-hd.json").read_text())
        self.assertEqual(hd["config"]["export_texture_source_sha256"], self.digests)
        self.assertEqual(len(hd["config"]["export_texture_pages"]), 2)

    def test_all_pages_are_frozen_before_inference_and_source_change_fails(self):
        def change_later_page(index):
            if index == 0:
                self.textures[1].write_bytes(png_bytes(rgba=(0, 0, 255, 128)))
        with self.assertRaisesRegex(ValueError, "Source atlas changed during super-resolution: page 1"):
            self.run_fixture(change_later_page)
        self.assertEqual(self.consumed["prepare"], self.original)
        self.assertEqual(self.consumed["combine"], self.original)
        report = self.report()
        self.assertFalse(report["complete"])
        self.assertIn("changed", report["error"])
        self.assertEqual([p["source_sha256"] for p in report["pages"]], self.digests)
        self.assertFalse((self.output / "manifest-hd.json").exists())

    def test_inference_failure_does_not_publish_an_hd_recipe(self):
        def fail(index):
            raise subprocess.CalledProcessError(2, "simulated-ncnn")
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_fixture(fail)
        self.assertFalse(self.report()["complete"])
        self.assertFalse((self.output / "manifest-hd.json").exists())


if __name__ == "__main__":
    unittest.main()
