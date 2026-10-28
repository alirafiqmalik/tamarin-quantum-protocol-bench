"""Run tamarin-prover on a theory and collect verdicts, proofs, and traces."""
import hashlib
import json
import os
import re
import subprocess
import threading
import time
from pathlib import Path

from .manifest import tamarin_version
from .prooftree import parse_proofs
from .trace import lemma_atoms, parse_trace_file

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work"
RESULTS = WORK / "results"
TRACES = WORK / "traces"
PROOFS = WORK / "proofs"
LOCK = threading.Lock()

LEMMA_RE = re.compile(
    r"^\s*([A-Za-z_][A-Za-z0-9_]*) \((exists-trace|all-traces)\): (.+?) \((\d+) steps\)\s*$",
    re.M,
)
TIME_RE = re.compile(r"processing time:\s*([0-9.]+)s")
HEURISTIC_RE = re.compile(r"^[CSIOPcsio]+$")


def _dirs():
    for folder in (WORK, RESULTS, TRACES, PROOFS):
        folder.mkdir(exist_ok=True)


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


def cache_key(text, heuristic, lemma):
    raw = f"{tamarin_version()}\n{heuristic}\n{lemma or '*'}\n{text}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _run(cmd, timeout, on_line):
    """Run the prover, stream lines, enforce the timeout. Returns (log, timed_out)."""
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    lines = []
    timed_out = False
    deadline = time.monotonic() + timeout

    def reader():
        for line in proc.stdout:
            lines.append(line)
            if on_line:
                on_line(line.rstrip("\n"))

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()
    while thread.is_alive():
        if time.monotonic() > deadline:
            timed_out = True
            proc.kill()
            break
        thread.join(0.2)
    proc.wait()
    thread.join(2)
    return "".join(lines), timed_out


def _has_trace(row):
    if row["quantifier"] == "exists-trace":
        return row["verified"]
    return "found trace" in row["status"]


def prove_file(path, heuristic="S", timeout=40, lemma=None, use_cache=True, lanes=None, on_line=None):
    """Prove one theory file. `lemma` restricts the run to one lemma."""
    if not HEURISTIC_RE.fullmatch(heuristic or ""):
        raise ValueError("Heuristic must be a Tamarin proof-method sequence such as S or C.")
    _dirs()
    text = Path(path).read_text()
    key = cache_key(text, heuristic, lemma)
    cached_path = RESULTS / f"{key}.json"
    if use_cache and cached_path.exists():
        hit = json.loads(cached_path.read_text())
        hit["cached"] = True
        return hit
    trace_path = TRACES / f"{key}.json"
    proof_path = PROOFS / f"{key}.spthy"
    for stale in (trace_path, proof_path):
        if stale.exists():
            stale.unlink()
    cmd = [
        "tamarin-prover",
        f"--prove={lemma}" if lemma else "--prove",
        f"--heuristic={heuristic}",
        "--quit-on-warning",
        "--derivcheck-timeout=0",
        f"--output-json={trace_path}",
        f"--output={proof_path}",
        str(path),
    ]
    cores = os.environ.get("TAMARIN_CORES")
    if cores and cores.isdigit():
        cmd += ["+RTS", f"-N{cores}", "-RTS"]
    started = time.monotonic()
    log, timed_out = _run(cmd, timeout, on_line)
    wall = round(time.monotonic() - started, 2)
    parsed = parse_summary(log)
    proofs = {}
    if proof_path.exists():
        try:
            proofs = parse_proofs(proof_path.read_text())
        except Exception as exc:  # parser must never break a result
            proofs = {"_error": str(exc)}
    traces = []
    if trace_path.exists():
        try:
            traces = parse_trace_file(trace_path, lanes=lanes)
        except Exception as exc:
            traces = []
            log += f"\n[trace parse error] {exc}"
    with_trace = [row for row in parsed["lemmas"] if _has_trace(row)]
    for row in parsed["lemmas"]:
        row["proof"] = proofs.get(row["name"])
        row["trace"] = None
        if lemma and row["name"] != lemma:
            row.update({"status": "not run", "verified": False, "steps": None, "proof": None})
    for row, msc in zip(with_trace, traces):
        atoms = lemma_atoms(text, row["name"])
        for event in msc["events"]:
            event["violation"] = any(
                action.startswith(atom + "(") or action.startswith(atom + " (") for action in event["actions"] for atom in atoms
            )
        msc["violation"] = [event["id"] for event in msc["events"] if event["violation"]]
        row["trace"] = msc
    tail = "\n".join(log.strip().splitlines()[-60:])
    result = {
        "key": key,
        "lemmas": parsed["lemmas"],
        "seconds": parsed["seconds"],
        "wall": wall,
        "timed_out": timed_out,
        "warning": parsed["warning"],
        "log": tail,
        "cached": False,
        "heuristic": heuristic,
        "lemma": lemma,
        "version": tamarin_version(),
        "hash": hashlib.sha256(text.encode()).hexdigest(),
    }
    if parsed["lemmas"] and not timed_out:
        cached_path.write_text(json.dumps(result))
    return result


def verified_names(result):
    return [item["name"] for item in result["lemmas"] if item["verified"]]
