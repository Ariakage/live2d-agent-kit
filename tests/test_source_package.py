"""Boundary checks for the archive audit; no image-generation or SDK dependencies."""
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("source_package", Path(__file__).resolve().parents[1] / "scripts/check-source-package.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SourcePackageTests(unittest.TestCase):
    def test_archive_rejects_parent_paths_and_links(self):
        for kind in ("parent", "symlink"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                archive = root / "source.tar"
                with tarfile.open(archive, "w") as tar:
                    member = tarfile.TarInfo("../outside" if kind == "parent" else "alias")
                    if kind == "symlink":
                        member.type = tarfile.SYMTYPE
                        member.linkname = "../outside"
                        tar.addfile(member)
                    else:
                        member.size = 1
                        tar.addfile(member, io.BytesIO(b"x"))
                with self.assertRaises(ValueError):
                    MODULE.unpack_source(archive, root / "kit")
                self.assertFalse((root / "outside").exists())

    def test_manifest_checks_fill_images_and_cannot_borrow_external_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            outer = Path(temporary)
            root = outer / "kit"
            root.mkdir()
            (root / "image.png").write_bytes(b"image")
            (outer / "fill.png").write_bytes(b"fill")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({"layers": [{"path": "image.png", "source_hole_fill_image": {"path": "../fill.png"}}]}))
            with self.assertRaisesRegex(ValueError, "escapes archive"):
                MODULE.manifest_sources(manifest, root)
            (root / "fill.png").write_bytes(b"fill")
            manifest.write_text(manifest.read_text().replace("../fill.png", "fill.png"))
            result = MODULE.manifest_sources(manifest, root)
            self.assertEqual(set(result["sources"]), {"image.png", "fill.png"})


if __name__ == "__main__":
    unittest.main()
