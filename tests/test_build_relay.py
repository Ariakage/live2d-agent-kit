"""Test the opt-in loopback relay without contacting external repositories."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/maven-curl-relay.py"
SPEC = importlib.util.spec_from_file_location("maven_relay", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BuildRelayTests(unittest.TestCase):
    def test_only_fixed_repository_relative_artifact_paths_are_accepted(self):
        self.assertEqual(MODULE.resource_path("/maven-central/org/example/a/1/a-1.jar"),
                         ("maven-central", "org/example/a/1/a-1.jar"))
        for value in ("/https://example.com/file", "/unknown/file", "/maven-central/../secret",
                      "/maven-central/%2e%2e/secret", "/maven-central/file?url=https://example.com",
                      "/maven-central//file"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                MODULE.resource_path(value)

    def test_fresh_artifact_is_recorded_and_tampered_cache_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fake = root / "fake-curl"
            fake.write_text("#!" + sys.executable + "\nimport pathlib,sys\n"
                            "pathlib.Path(sys.argv[sys.argv.index('--output')+1]).write_bytes(b'fresh-artifact')\n"
                            "print('200\\n'+sys.argv[-1])\n")
            fake.chmod(0o700)
            cache = root / "cache"
            process = subprocess.Popen([sys.executable, str(SCRIPT), "--cache", str(cache),
                                        "--require-empty", "--curl", str(fake)], stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL)
            try:
                deadline = time.monotonic() + 10
                while not (cache / "relay.json").exists():
                    if time.monotonic() > deadline or process.poll() is not None:
                        self.fail("Test relay failed to start")
                    time.sleep(0.05)
                state = json.loads((cache / "relay.json").read_text())
                self.assertTrue(state["initialCacheEmpty"])
                url = state["url"] + "/maven-central/org/example/a/1/a-1.jar"
                with urlopen(url, timeout=5) as response:
                    self.assertEqual(response.read(), b"fresh-artifact")
                records = [json.loads(line) for line in (cache / "requests.jsonl").read_text().splitlines()]
                self.assertEqual(records[0]["url"], "https://repo.maven.apache.org/maven2/org/example/a/1/a-1.jar")
                self.assertEqual(records[0]["bytes"], len(b"fresh-artifact"))
                (cache / "artifacts/maven-central/org/example/a/1/a-1.jar").write_bytes(b"changed")
                with self.assertRaises(HTTPError) as caught:
                    urlopen(url, timeout=5)
                self.assertEqual(caught.exception.code, 502)
                caught.exception.close()
            finally:
                process.terminate()
                process.wait(timeout=5)


if __name__ == "__main__":
    unittest.main()
