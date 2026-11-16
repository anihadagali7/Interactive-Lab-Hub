#!/usr/bin/env python3
"""Serve the game with browser caching off, so every reload picks up your edits.

    python3 serve.py              http://localhost:5173
    python3 serve.py 8000         another port
    python3 serve.py 5173 0.0.0.0 reachable from other devices on the network (the Pi, a phone)
"""
import http.server
import os
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    print(f"Five Star Taxi: http://localhost:{port}", flush=True)
    http.server.ThreadingHTTPServer((host, port), Handler).serve_forever()
