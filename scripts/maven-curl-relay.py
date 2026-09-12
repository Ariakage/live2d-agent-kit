#!/usr/bin/env python3
"""Optional loopback Maven transport using curl and the same official HTTPS sources.

This downloads dependencies without reading previously compiled engine output.
No global proxy or Gradle configuration is changed. Keep its cache and request
log out of Git.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

UPSTREAMS = {
    "maven-central": "https://repo.maven.apache.org/maven2/",
    "gradle-plugins": "https://plugins.gradle.org/m2/",
    "google-maven": "https://dl.google.com/dl/android/maven2/",
}


def resource_path(request_path):
    parsed = urlsplit(request_path)
    if parsed.query or parsed.fragment or not re.fullmatch(r"/[A-Za-z0-9_./+\-]+", parsed.path):
        raise ValueError("Only Maven artifact paths are supported")
    parts = parsed.path.lstrip("/").split("/")
    if len(parts) < 2 or parts[0] not in UPSTREAMS or any(p in ("", ".", "..") for p in parts):
        raise ValueError("Unknown repository or invalid artifact path")
    return parts[0], "/".join(parts[1:])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--port", type=int, default=0, help="Loopback port; 0 selects an unused port")
    parser.add_argument("--require-empty", action="store_true", help="Reject an existing nonempty cache for a cold-build audit")
    parser.add_argument("--curl", default="curl")
    args = parser.parse_args()
    cache = args.cache.resolve()
    initially_empty = not cache.exists() or not any(cache.iterdir())
    if args.require_empty and not initially_empty:
        parser.error("Cold-build relay cache must be empty")
    cache.mkdir(parents=True, exist_ok=True)
    guard = threading.Lock()
    locks, failures = {}, {}
    def record(value):
        with guard, (cache / "requests.jsonl").open("a") as stream:
            stream.write(json.dumps({"time": time.time(), **value}) + "\n")

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        def do_HEAD(self):
            self.respond(False)
        def do_GET(self):
            self.respond(True)
        def log_message(self, *_):
            pass
        def respond(self, send_body):
            try:
                repository, artifact = resource_path(self.path)
            except ValueError:
                self.send_error(400)
                return
            key = repository + "/" + artifact
            destination = cache / "artifacts" / key
            metadata = cache / "records" / (key + ".json")
            if not destination.resolve().is_relative_to(cache):
                self.send_error(400)
                return
            with guard:
                lock = locks.setdefault(key, threading.Lock())
            with lock:
                if key in failures:
                    self.send_error(failures[key])
                    return
                if not destination.is_file():
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    upstream = UPSTREAMS[repository] + artifact
                    temporary = cache / "partial" / key
                    temporary.parent.mkdir(parents=True, exist_ok=True)
                    command = [args.curl, "--fail", "--location", "--silent", "--show-error", "--connect-timeout", "15",
                               "--max-time", "120", "--speed-limit", "100000", "--speed-time", "20",
                               "--continue-at", "-", "--proto", "=https", "--proto-redir", "=https",
                               "--output", str(temporary), "--write-out", "%{http_code}\n%{url_effective}", upstream]
                    try:
                        # Resume this relay's own partial transfer after a slow
                        # connection instead of discarding megabytes each retry.
                        for attempt in range(1, 13):
                            fetched = subprocess.run(command, text=True, capture_output=True)
                            fields = fetched.stdout.splitlines()
                            status = int(fields[0]) if fields and fields[0].isdigit() else 502
                            if not fetched.returncode and status in (200, 206):
                                break
                            record({"url": upstream, "httpStatus": status, "curlExit": fetched.returncode,
                                    "attempt": attempt, "partialBytes": temporary.stat().st_size if temporary.exists() else 0,
                                    "error": fetched.stderr[-1000:]})
                            if status == 404 or (fetched.returncode not in (18, 28, 35, 56) and status not in (429, 500, 502, 503, 504)):
                                break
                            time.sleep(1)
                        if fetched.returncode or status not in (200, 206):
                            record({"url": upstream, "httpStatus": status, "curlExit": fetched.returncode,
                                    "error": fetched.stderr[-1000:]})
                            if status == 404:
                                failures[key] = 404
                            self.send_error(404 if status == 404 else 502)
                            return
                        body = temporary.read_bytes()
                        identity = {"url": upstream, "effectiveUrl": fields[-1], "httpStatus": status,
                                    "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
                        temporary.replace(destination)
                        metadata.parent.mkdir(parents=True, exist_ok=True)
                        metadata.write_text(json.dumps(identity, indent=2) + "\n")
                        record(identity)
                    except OSError as exc:
                        record({"url": upstream, "httpStatus": 502, "error": str(exc)})
                        self.send_error(502)
                        return
                    # Failed partial bytes stay only inside this relay cache
                    # so a later invocation can resume the same fresh download.
                # Reuse only this relay's own verified bytes, never Gradle/m2.
                identity = json.loads(metadata.read_text())
                if hashlib.sha256(destination.read_bytes()).hexdigest() != identity["sha256"]:
                    self.send_error(502, "Relay cache fingerprint mismatch")
                    return
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(destination.stat().st_size))
                self.end_headers()
                if send_body:
                    try:
                        with destination.open("rb") as source:
                            while block := source.read(1024 * 1024):
                                self.wfile.write(block)
                    except (BrokenPipeError, ConnectionResetError):
                        pass

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.daemon_threads = True
    state = {"url": f"http://127.0.0.1:{server.server_port}", "initialCacheEmpty": initially_empty,
             "upstreams": UPSTREAMS, "scope": "Fresh official-source dependency transport; no application build output reuse"}
    (cache / "relay.json").write_text(json.dumps(state, indent=2) + "\n")
    print(json.dumps(state), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
