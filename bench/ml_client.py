import importlib.util
import json
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIENT_PATH = ROOT / "vendor" / "tamarin-ml-api" / "client.py"
SPEC = importlib.util.spec_from_file_location("tamarin_ml_client", CLIENT_PATH)


def overview(timeout=1.5):
    url = "http://127.0.0.1:3001/"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            raw = response.read(200000)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {"up": False, "detail": str(exc)}
    stripped = raw.lstrip()
    if not stripped.startswith(b"{") and not stripped.startswith(b"["):
        return {
            "up": False,
            "detail": "Port 3001 answered, but the body is not the ML API overview.",
        }
    try:
        data = json.loads(raw.decode())
    except json.JSONDecodeError:
        return {"up": False, "detail": "Port 3001 did not return JSON."}
    theories = []
    if isinstance(data, dict):
        for name, entry in data.items():
            chosen = None
            if isinstance(entry, dict):
                chosen = entry
            elif isinstance(entry, list) and entry and isinstance(entry[0], dict):
                chosen = entry[0]
            if chosen is None:
                continue
            theories.append(
                {
                    "name": name,
                    "theoryIndex": chosen.get("theoryIndex"),
                    "theoryKind": chosen.get("theoryKind"),
                }
            )
    return {"up": True, "theories": theories}


def proof_methods(theory_kind, theory_index, lemma):
    if theory_index is None or not lemma:
        raise ValueError("theoryIndex and lemma are required.")
    try:
        import requests  # noqa: F401 - required by the vendored client
    except ImportError as exc:
        raise RuntimeError("Install requests to use the optional Tamarin ML API client.") from exc
    upstream = importlib.util.module_from_spec(SPEC)
    SPEC.loader.exec_module(upstream)
    remote = upstream.TamarinClient()
    response = remote.get_initial_constraint_system(theory_kind or "trace", theory_index, lemma)
    if not response.ok:
        raise RuntimeError(response.text[:500])
    payload = response.json()
    methods = payload.get("prettyMethods") or payload.get("proofMethods") or []
    if not isinstance(methods, list):
        methods = [methods]
    return {
        "status": payload.get("status"),
        "methods": [str(item) for item in methods[:40]],
    }
