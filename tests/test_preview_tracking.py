"""Dependency-copy boundaries. Fixtures are bytes, not real inference models."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
preview=module('preview_tracking','scripts/prepare-preview.py')
server=module('camera_server','templates/web-preview/server.py')

class TrackingPreparationTests(unittest.TestCase):
    def test_only_pinned_local_files_are_accepted_and_tampering_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp);(directory/'models').mkdir();data=b'fixture'
            (directory/'models/face.task').write_bytes(data);(directory/'unrelated.txt').write_text('not copied')
            lock={'files':[{'path':'models/face.task','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}]}
            found=preview.tracking_files(directory,lock)
            self.assertEqual([item['path'] for item,_ in found],['models/face.task'])
            (directory/'models/face.task').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError,'pinned bytes'):preview.tracking_files(directory,lock)
    def test_tracking_cannot_borrow_an_outside_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'tracking').mkdir();outside=root/'outside.task';outside.write_bytes(b'fixture')
            (root/'tracking/face.task').symlink_to(outside)
            with self.assertRaisesRegex(ValueError,'escapes'):preview.tracking_files(root/'tracking',{'files':[{'path':'face.task','bytes':7,'sha256':hashlib.sha256(b'fixture').hexdigest()}]})
    def test_server_allows_same_origin_camera_but_no_microphone(self):
        headers=[]
        # The method only emits headers; no socket, device or HTTP request is used.
        class Fixture(server.Handler):
            def __init__(self): pass
            send_header=lambda self,k,v:headers.append((k,v))
        from unittest import mock
        with mock.patch.object(server.SimpleHTTPRequestHandler,'end_headers'):
            server.Handler.end_headers(Fixture())
        self.assertIn(('Permissions-Policy','camera=(self), microphone=()'),headers)
        self.assertIn(('Content-Security-Policy',"connect-src 'self'"),headers)
        self.assertEqual(server.Handler.extensions_map['.mjs'],'text/javascript')

if __name__=='__main__':unittest.main()
