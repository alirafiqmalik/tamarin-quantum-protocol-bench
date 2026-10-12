import json
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from bench.assemble import WORK, assemble
from bench.catalog import CATALOG, HEURISTICS
from bench.learn import learn
from bench.ml_client import overview, proof_methods
from bench.prove import LOCK, prove_file

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
HOST = "127.0.0.1"
PORT = 8765
MAX_THEORY = 200_000


def _choices(protocol):
    found = next(item for item in CATALOG["protocols"] if item["id"] == protocol)
    spec = {}
    for field in found["fields"]:
        if field["kind"] == "choice":
            spec[field["key"]] = {opt["id"] for opt in field["options"]}
        else:
            spec[field["key"]] = "bool"
    return found, spec


def normalize(protocol, raw):
    _found, spec = _choices(protocol)
    raw = raw or {}
    options = {}
    for key, allowed in spec.items():
        if allowed == "bool":
            options[key] = bool(raw.get(key))
        else:
            value = raw.get(key)
            if value not in allowed:
                raise ValueError(f"Unknown {key}: {value}")
            options[key] = value
    return options


def check_theory(text):
    if not isinstance(text, str) or not text.strip():
        raise ValueError("The theory is empty.")
    if len(text) > MAX_THEORY:
        raise ValueError("The theory is too large.")
    if "\x00" in text:
        raise ValueError("The theory contains a null byte.")
    lowered = text.lower()
    if "include(" in lowered or "include (" in lowered:
        raise ValueError("Edited theories cannot include other files.")
    return text


def write_edit(text):
    WORK.mkdir(exist_ok=True)
    path = WORK / f"edit_{uuid.uuid4().hex}.spthy"
    path.write_text(text)
    return path


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}")

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path, content_type):
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_THEORY + 10_000:
            raise ValueError("Request is too large.")
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode())

    def _busy(self):
        if not LOCK.acquire(blocking=False):
            self._json(409, {"error": "A Tamarin run is already going."})
            return True
        return False

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == "/":
                self._file(STATIC / "index.html", "text/html; charset=utf-8")
                return
            if path == "/api/catalog":
                self._json(200, CATALOG)
                return
            if path == "/api/ml":
                self._json(200, overview())
                return
            if path.startswith("/static/"):
                rel = path[len("/static/") :]
                target = (STATIC / rel).resolve()
                if STATIC.resolve() not in target.parents and target != STATIC.resolve():
                    self._json(404, {"error": "Not found."})
                    return
                if not target.is_file():
                    self._json(404, {"error": "Not found."})
                    return
                kind = "text/css" if target.suffix == ".css" else "text/javascript"
                self._file(target, kind)
                return
            self._json(404, {"error": "Not found."})
        except Exception as exc:
            self._json(500, {"error": str(exc)})

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = self._read_json()
            if path == "/api/assemble":
                protocol = body.get("protocol")
                options = normalize(protocol, body.get("options"))
                theory, _path, label = assemble(protocol, options)
                self._json(200, {"theory": theory, "label": label})
                return
            if path == "/api/verify":
                heuristic = body.get("heuristic") or "S"
                if heuristic not in HEURISTICS:
                    raise ValueError("Unknown heuristic.")
                timeout = int(body.get("timeout") or 40)
                timeout = max(5, min(timeout, 90))
                if self._busy():
                    return
                try:
                    if body.get("theory"):
                        text = check_theory(body["theory"])
                        target = write_edit(text)
                        label = "edited theory"
                    else:
                        protocol = body.get("protocol")
                        options = normalize(protocol, body.get("options"))
                        _theory, target, label = assemble(protocol, options)
                    result = prove_file(target, heuristic=heuristic, timeout=timeout)
                finally:
                    LOCK.release()
                result["label"] = label
                self._json(200, result)
                return
            if path == "/api/learn":
                protocol = body.get("protocol")
                options = normalize(protocol, body.get("options"))
                timeout = int(body.get("timeout") or 40)
                timeout = max(5, min(timeout, 90))
                if self._busy():
                    return
                try:
                    result = learn(protocol, options, timeout=timeout)
                finally:
                    LOCK.release()
                self._json(200, result)
                return
            if path == "/api/ml/methods":
                state = overview()
                if not state.get("up"):
                    self._json(200, state)
                    return
                methods = proof_methods(
                    body.get("theoryKind") or "trace",
                    body.get("theoryIndex"),
                    body.get("lemma"),
                )
                self._json(200, methods)
                return
            self._json(404, {"error": "Not found."})
        except Exception as exc:
            self._json(400, {"error": str(exc)})


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"http://127.0.0.1:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
