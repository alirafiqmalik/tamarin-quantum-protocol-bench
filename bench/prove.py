import hashlib
import json
import re
import subprocess
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work"
CACHE_PATH = WORK / "cache.json"
LOCK = threading.Lock()

LEMMA_RE = re.compile(
    r"^\s*([A-Za-z_][A-Za-z0-9_]*) \((exists-trace|all-traces)\): (.+?) \((\d+) steps\)\s*$",
    re.M,
)
TIME_RE = re.compile(r"processing time:\s*([0-9.]+)s")
HEURISTIC_RE = re.compile(r"^[CSIOPcsio]+$")


def _cache():
    if not CACHE_PATH.exists():
        return {}
    return json.loads(CACHE_PATH.read_text())


def _store(key, value):
    WORK.mkdir(exist_ok=True)
    data = _cache()
    data[key] = value
    CACHE_PATH.write_text(json.dumps(data))


def parse_summary(log):
    lemmas = []
    for match in LEMMA_RE.finditer(log):
        status = match.group(3).strip()
        lemmas.append(
            {
                "name": match.group(1),
                "quantifier": match.group(2),
                "status": status,
                "verified": status == "verified",
                "steps": int(match.group(4)),
            }
        )
    timing = TIME_RE.search(log)
    seconds = float(timing.group(1)) if timing else None
    warning = "wellformedness checks failed" in log
    return {"lemmas": lemmas, "seconds": seconds, "warning": warning and not lemmas}


def prove_file(path, heuristic="S", timeout=40, use_cache=True):
    if not HEURISTIC_RE.fullmatch(heuristic or ""):
        raise ValueError("Heuristic must be a Tamarin proof-method sequence such as S or C.")
    text = Path(path).read_text()
    key = hashlib.sha256(f"{heuristic}\n{text}".encode()).hexdigest()
    if use_cache:
        hit = _cache().get(key)
        if hit:
            hit = dict(hit)
            hit["cached"] = True
            return hit
    cmd = [
        "tamarin-prover",
        "--prove",
        f"--heuristic={heuristic}",
        "--quit-on-warning",
        str(path),
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        log = (proc.stdout or "") + (proc.stderr or "")
        timed_out = False
    except subprocess.TimeoutExpired as exc:
        out = exc.stdout or ""
        err = exc.stderr or ""
        if isinstance(out, bytes):
            out = out.decode(errors="replace")
        if isinstance(err, bytes):
            err = err.decode(errors="replace")
        log = out + err
        timed_out = True
    parsed = parse_summary(log)
    tail = "\n".join(log.strip().splitlines()[-40:])
    result = {
        "lemmas": parsed["lemmas"],
        "seconds": parsed["seconds"],
        "timed_out": timed_out,
        "warning": parsed["warning"],
        "log": tail,
        "cached": False,
        "heuristic": heuristic,
    }
    if parsed["lemmas"] and not timed_out:
        _store(key, result)
    return result


def verified_names(result):
    return [item["name"] for item in result["lemmas"] if item["verified"]]
