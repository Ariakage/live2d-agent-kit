"""Exercise fresh full and sparse engine setup against a local Git fixture."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class BuildSetupTests(unittest.TestCase):
    def make_fixture(self, temporary):
        root = Path(temporary)
        upstream = root / "upstream"
        upstream.mkdir()
        def git(*args):
            return subprocess.check_output(["git", *args], cwd=upstream, stderr=subprocess.DEVNULL)
        git("init", "-q")
        git("config", "uploadpack.allowFilter", "true")
        files = {
            "src/main/kotlin/Engine.kt": "old source\n",
            "src/test/kotlin/EngineTest.kt": "test source\n",
            "src/main/resources/agent/skills/face.md": "embedded reference\n",
            ".agent/skills/psd2live-rigging/references/face.md": "host reference\n",
            "gradle/wrapper/gradle-wrapper.properties": "distributionUrl=fixture\n",
            "licenses/DEPENDENCY.txt": "license fixture\n",
            "LICENSE": "license fixture\n",
            "build.gradle.kts": "tasks.register(\"classes\")\n",
            "settings.gradle.kts": "rootProject.name = \"fixture\"\n",
            "gradlew": "#!/bin/sh\n",
            "docs/imgs/example.txt": "non-build image fixture\n",
            "examples/character/example.txt": "non-build artwork fixture\n",
        }
        for name, value in files.items():
            path = upstream / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value)
        git("add", ".")
        git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture")
        commit = git("rev-parse", "HEAD").decode().strip()
        changed = "src/main/kotlin/Engine.kt"
        (upstream / changed).write_text("patched source\n")
        patch = git("diff", "--binary")
        (upstream / changed).write_text(files[changed])
        kit = root / "kit"
        for directory in ("scripts", "integrations/psd2live", "patches"):
            (kit / directory).mkdir(parents=True, exist_ok=True)
        shutil.copy2(Path(__file__).resolve().parents[1] / "scripts/setup-psd2live.py", kit / "scripts/setup-psd2live.py")
        (kit / "patches/psd2live-agent-kit.patch").write_bytes(patch)
        lock = {"url": upstream.as_uri(), "commit": commit,
                "patch_sha256": hashlib.sha256(patch).hexdigest(),
                "patched_files": {changed: hashlib.sha256(b"patched source\n").hexdigest()}}
        (kit / "integrations/psd2live/engine-lock.json").write_text(json.dumps(lock))
        return kit, files

    def test_source_only_retains_all_build_sources_resources_and_patch(self):
        with tempfile.TemporaryDirectory() as temporary:
            kit, files = self.make_fixture(temporary)
            engine = Path(temporary) / "sparse-engine"
            command = [sys.executable, str(kit / "scripts/setup-psd2live.py"), "--source-only", "--directory", str(engine)]
            for _ in range(2):
                result = subprocess.run(command, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
            for name in files:
                expected = not name.startswith(("docs/", "examples/"))
                self.assertEqual((engine / name).is_file(), expected, name)
            self.assertEqual((engine / "src/main/kotlin/Engine.kt").read_text(), "patched source\n")
            self.assertIn(b"docs/imgs/example.txt", subprocess.check_output(["git", "ls-tree", "-r", "--name-only", "HEAD"], cwd=engine))

    def test_default_setup_still_materializes_full_checkout(self):
        with tempfile.TemporaryDirectory() as temporary:
            kit, files = self.make_fixture(temporary)
            engine = Path(temporary) / "full-engine"
            result = subprocess.run([sys.executable, str(kit / "scripts/setup-psd2live.py"), "--directory", str(engine)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            for name in files:
                self.assertTrue((engine / name).is_file(), name)


if __name__ == "__main__":
    unittest.main()
