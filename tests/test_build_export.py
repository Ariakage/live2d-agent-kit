"""Check explicit Gradle selection without invoking the network or compiler."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class BuildExportTests(unittest.TestCase):
    def run_export(self, alternate=False, missing=False):
        with tempfile.TemporaryDirectory(prefix="kit export ") as temporary:
            root = Path(temporary)
            kit, engine = root / "kit", root / "engine"
            scripts = kit / "scripts"
            scripts.mkdir(parents=True)
            engine.mkdir()
            shutil.copy2(Path(__file__).resolve().parents[1] / "scripts/export-model.sh", scripts)
            (scripts / "validate.py").write_text("# Manifest validation is covered separately.\n")
            (engine / "gradlew").write_text('printf "wrapper\\n%s\\n" "$@" > "$RESULT_LOG"\n')
            supplied = root / "fresh gradle" / "bin" / "gradle"
            supplied.parent.mkdir(parents=True)
            supplied.write_text('printf "supplied\\n%s\\n" "$@" > "$RESULT_LOG"\n')
            env = {k: v for k, v in os.environ.items() if not k.startswith("PSD2LIVE_")}
            env.update(PSD2LIVE_DIR=str(engine), RESULT_LOG=str(root / "result"))
            if alternate:
                # Relative paths must be resolved before cd into the engine.
                env["PSD2LIVE_GRADLE"] = "missing" if missing else str(supplied.relative_to(root))
                env["PSD2LIVE_MAVEN_RELAY"] = "http://127.0.0.1:54321"
            result = subprocess.run(["bash", str(scripts / "export-model.sh"), "input.json", "output"],
                                    cwd=root, env=env, text=True, capture_output=True)
            captured = (root / "result").read_text() if (root / "result").exists() else ""
            return result, captured

    def test_default_wrapper_unchanged(self):
        result, captured = self.run_export()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(captured.startswith("wrapper\n"))
        self.assertIn("exportManifest\n", captured)

    def test_explicit_gradle_path_with_spaces_and_relay(self):
        result, captured = self.run_export(alternate=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(captured.startswith("supplied\n"))
        self.assertIn("-PagentKitMavenRelay=http://127.0.0.1:54321\n", captured)

    def test_missing_gradle_fails_before_launch(self):
        result, captured = self.run_export(alternate=True, missing=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("PSD2LIVE_GRADLE", result.stderr)
        self.assertEqual(captured, "")


if __name__ == "__main__":
    unittest.main()
