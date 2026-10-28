import json
import socket
import subprocess
import sys
import time
import unittest
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class AppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = free_port()
        cls.proc = subprocess.Popen([sys.executable, "app.py", "--port", str(cls.port)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                cls.get("/api/environment")
                return
            except OSError:
                time.sleep(0.1)
        raise RuntimeError("server did not start")

    @classmethod
    def tearDownClass(cls):
        cls.proc.kill()
        cls.proc.wait()

    @classmethod
    def get(cls, path):
        with urllib.request.urlopen(f"http://127.0.0.1:{cls.port}{path}", timeout=30) as res:
            return res.status, res.headers.get("Content-Type", ""), res.read()

    @classmethod
    def post(cls, path, body):
        req = urllib.request.Request(f"http://127.0.0.1:{cls.port}{path}", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.status, res.headers.get("Content-Type", ""), res.read()

    def test_catalog_and_snapshot_agree(self):
        _s, _t, body = self.get("/api/catalog")
        _s, _t, snap = self.get("/catalog.json")
        self.assertEqual(json.loads(body)["protocols"][0]["id"], json.loads(snap)["protocols"][0]["id"])

    def test_assemble_and_diff(self):
        _s, _t, body = self.post("/api/assemble", {"protocol": "qsend", "options": {"leak_key": True}})
        data = json.loads(body)
        self.assertIn("Out(k)", data["theory"])
        self.assertEqual(data["lemmas"], ["executable", "secret", "correspondence"])
        _s, _t, body = self.post("/api/diff", {"protocol": "qsend", "a": {"leak_key": False}, "b": {"leak_key": True}})
        diff = json.loads(body)["diff"]
        self.assertTrue(any(line.startswith("+") and "Out(k)" in line for line in diff))

    def test_streaming_verify(self):
        _s, ctype, body = self.post("/api/verify", {"protocol": "qsend", "options": {"leak_key": True}, "stream": True, "timeout": 30, "lemma": "secret"})
        self.assertIn("text/event-stream", ctype)
        events = [line[len("event: "):] for line in body.decode().splitlines() if line.startswith("event: ")]
        self.assertIn("status", events)
        self.assertEqual(events[-1], "result")
        payload = json.loads([line for line in body.decode().splitlines() if line.startswith("data: ")][-1][6:])
        secret = next(row for row in payload["lemmas"] if row["name"] == "secret")
        self.assertIn("falsified", secret["status"])
        self.assertIsNotNone(secret["trace"])

    def test_evidence_routes(self):
        status, _t, body = self.get("/api/evidence")
        self.assertEqual(status, 200)
        self.assertIn("records", json.loads(body))
        status, _t, _b = self.get("/evidence/index.json")
        self.assertIn(status, (200, 404))

    def test_rejects_include(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.post("/api/verify", {"protocol": "qsend", "theory": 'theory X begin include("x") end', "timeout": 5})
        self.assertEqual(ctx.exception.code, 400)


if __name__ == "__main__":
    unittest.main()
