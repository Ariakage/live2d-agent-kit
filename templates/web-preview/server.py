#!/usr/bin/env python3
"""Serve only this generated preview folder on loopback. Never stop an existing service."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys

class Handler(SimpleHTTPRequestHandler):
    extensions_map={**SimpleHTTPRequestHandler.extensions_map,'.js':'text/javascript','.moc3':'application/octet-stream','.wasm':'application/wasm'}
    def end_headers(self):
        self.send_header('Cache-Control','no-cache')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Permissions-Policy','camera=(), microphone=()')
        super().end_headers()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8793);args=parser.parse_args()
    try: server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=str(Path(__file__).resolve().parent)))
    except OSError as error:
        print(f'Cannot bind loopback port {args.port}: {error}. Choose another --port; existing services are left alone.',file=sys.stderr);sys.exit(1)
    print(f'Live2D preview: http://127.0.0.1:{server.server_port}/',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
