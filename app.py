import argparse
import difflib
import json
import mimetypes
import queue
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from bench import registry
from bench.learn import learn
from bench.manifest import EVIDENCE, environment, load_index, load_record
from bench.prove import LOCK, WORK, prove_file

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
MAX_THEORY = 200_000
MAX_TIMEOUT = 600


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


def clamp_timeout(value, default=40):
    try:
        timeout = int(value or default)
    except (TypeError, ValueError):
        timeout = default
    return max(5, min(timeout, MAX_TIMEOUT))


def resolve_target(body):
    """Return (path, label, lanes, protocol) for a verify request."""
    protocol = body.get("protocol")
    if body.get("theory"):
        text = check_theory(body["theory"])
        target = write_edit(text)
        lanes = registry.lanes(protocol) if protocol in registry.ids() else None
        return target, "edited theory", lanes, protocol
    options = registry.normalize(protocol, body.get("options"))
    _theory, target, label = registry.assemble(protocol, options)
    return target, label, registry.lanes(protocol), protocol


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}", flush=True)

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path):
        data = path.read_bytes()
        kind = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if path.suffix in (".html", ".js", ".css", ".json", ".svg"):
            kind += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_THEORY + 10_000:
            raise ValueError("Request is too large.")
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode() or "{}")

    def _busy(self):
        if not LOCK.acquire(blocking=False):
            self._json(409, {"error": "A Tamarin run is already going."})
            return True
        return False

    def _static(self, path):
        rel = path.lstrip("/") or "index.html"
        target = (STATIC / rel).resolve()
        if STATIC.resolve() not in target.parents and target != STATIC.resolve():
            return False
        if target.is_file():
            self._file(target)
            return True
        return False

    def do_HEAD(self):
        self.send_response(200 if urlparse(self.path).path == "/" else 404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        try:
            if path == "/api/catalog":
                self._json(200, registry.catalog())
                return
            if path == "/api/environment":
                self._json(200, environment())
                return
            if path == "/api/evidence":
                self._json(200, load_index())
                return
            if path.startswith("/api/evidence/"):
                record = load_record(path.rsplit("/", 1)[1])
                if record is None:
                    self._json(404, {"error": "No such record."})
                else:
                    self._json(200, record)
                return
            if path == "/catalog.json":
                self._json(200, registry.catalog())
                return
            if path.startswith("/evidence/"):
                rel = path[len("/evidence/"):]
                target = (EVIDENCE / rel).resolve()
                if EVIDENCE.resolve() in target.parents and target.is_file():
                    self._file(target)
                else:
                    self._json(404, {"error": "Not found."})
                return
            if path.startswith("/api/"):
                self._json(404, {"error": "Not found."})
                return
            if self._static(path):
                return
            if path.startswith("/static/") and self._static(path[len("/static/"):]):
                return
            # SPA fallback
            self._file(STATIC / "index.html")
        except Exception as exc:
            self._json(500, {"error": str(exc)})

    def _stream_verify(self, body):
        """Server-sent events: log lines, heartbeat, then the result."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        events = queue.Queue()

        def emit(kind, payload):
            events.put((kind, payload))

        def worker():
            try:
                heuristic = body.get("heuristic") or "S"
                timeout = clamp_timeout(body.get("timeout"))
                lemma = body.get("lemma") or None
                target, label, lanes, _protocol = resolve_target(body)
                emit("status", {"label": label, "timeout": timeout})
                result = prove_file(target, heuristic=heuristic, timeout=timeout, lemma=lemma, lanes=lanes, on_line=lambda line: emit("log", {"line": line}))
                result["label"] = label
                emit("result", result)
            except Exception as exc:
                emit("error", {"error": str(exc)})
            finally:
                LOCK.release()
                events.put(None)

        threading.Thread(target=worker, daemon=True).start()
        while True:
            try:
                item = events.get(timeout=1.0)
            except queue.Empty:
                self.wfile.write(b"event: tick\ndata: {}\n\n")
                self.wfile.flush()
                continue
            if item is None:
                break
            kind, payload = item
            data = json.dumps(payload)
            self.wfile.write(f"event: {kind}\ndata: {data}\n\n".encode())
            self.wfile.flush()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = self._read_json()
            if path == "/api/assemble":
                protocol = body.get("protocol")
                options = registry.normalize(protocol, body.get("options"))
                theory, _path, label = registry.assemble(protocol, options)
                self._json(200, {"theory": theory, "label": label, "lemmas": registry.lemmas(protocol, options), "options": options})
                return
            if path == "/api/diff":
                protocol = body.get("protocol")
                left = registry.normalize(protocol, body.get("a"))
                right = registry.normalize(protocol, body.get("b"))
                text_a, _p, label_a = registry.assemble(protocol, left)
                text_b, _p, label_b = registry.assemble(protocol, right)
                diff = list(difflib.unified_diff(text_a.splitlines(), text_b.splitlines(), label_a, label_b, lineterm="", n=2))
                self._json(200, {"a": label_a, "b": label_b, "diff": diff})
                return
            if path == "/api/verify":
                heuristic = body.get("heuristic") or "S"
                if heuristic not in registry.HEURISTICS:
                    raise ValueError("Unknown heuristic.")
                if self._busy():
                    return
                if body.get("stream"):
                    self._stream_verify(body)
                    return
                try:
                    timeout = clamp_timeout(body.get("timeout"))
                    target, label, lanes, _protocol = resolve_target(body)
                    result = prove_file(target, heuristic=heuristic, timeout=timeout, lemma=body.get("lemma") or None, lanes=lanes)
                finally:
                    LOCK.release()
                result["label"] = label
                self._json(200, result)
                return
            if path == "/api/compare":
                protocol = body.get("protocol")
                options = registry.normalize(protocol, body.get("options"))
                timeout = clamp_timeout(body.get("timeout"))
                if self._busy():
                    return
                try:
                    result = learn(protocol, options, timeout=timeout)
                finally:
                    LOCK.release()
                self._json(200, result)
                return
            self._json(404, {"error": "Not found."})
        except Exception as exc:
            self._json(400, {"error": str(exc)})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8780)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
