"""Evidence manifest helpers: tool version, model hashes, record layout."""
import hashlib
import json
import os
import platform
import re
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence"
INDEX = EVIDENCE / "index.json"

_VERSION = None


def tamarin_version():
    """Return the tamarin-prover version string, or 'unavailable'."""
    global _VERSION
    if _VERSION is not None:
        return _VERSION
    try:
        proc = subprocess.run(
            ["tamarin-prover", "--version"], capture_output=True, text=True, timeout=20
        )
        out = (proc.stdout or "") + (proc.stderr or "")
    except (OSError, subprocess.SubprocessError):
        out = ""
    match = re.search(r"tamarin-prover\s+(\d+\.\d+(?:\.\d+)?)", out)
    found = match.group(1) if match else "unavailable"
    _VERSION = found
    return found


def model_hash(text):
    return hashlib.sha256(text.encode()).hexdigest()


def environment():
    return {
        "tamarin": tamarin_version(),
        "python": platform.python_version(),
        "platform": platform.platform(),
        "cpus": os.cpu_count(),
    }


def record_id(protocol, options, lemma, heuristic):
    key = json.dumps([protocol, options, lemma, heuristic], sort_keys=True)
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def load_index():
    if not INDEX.exists():
        return {"records": {}, "environment": environment(), "updated": None}
    return json.loads(INDEX.read_text())


def save_index(index):
    EVIDENCE.mkdir(exist_ok=True)
    index["updated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    index["environment"] = environment()
    INDEX.write_text(json.dumps(index, indent=1, sort_keys=True))


def store_record(record):
    """Write one evidence record and update the index summary."""
    EVIDENCE.mkdir(exist_ok=True)
    rid = record["id"]
    folder = EVIDENCE / record["protocol"]
    folder.mkdir(exist_ok=True)
    (folder / f"{rid}.json").write_text(json.dumps(record, indent=1))
    index = load_index()
    summary = {k: record[k] for k in ("id", "protocol", "options", "label", "lemma", "heuristic", "status", "verified", "steps", "seconds", "timed_out", "hash", "recorded")}
    summary["path"] = f"{record['protocol']}/{rid}.json"
    index["records"][rid] = summary
    save_index(index)
    return rid


def load_record(rid):
    index = load_index()
    summary = index["records"].get(rid)
    if not summary:
        return None
    path = EVIDENCE / summary["path"]
    if not path.exists():
        return None
    return json.loads(path.read_text())


SUMMARY_KEYS = ("id", "protocol", "options", "label", "lemma", "heuristic", "status", "verified", "steps", "seconds", "timed_out", "hash", "recorded")


def rebuild_index():
    """Recreate index.json from the record files (safe after concurrent batches)."""
    records = {}
    for path in sorted(EVIDENCE.glob("*/*.json")):
        try:
            record = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        if "id" not in record or "lemma" not in record:
            continue
        summary = {key: record.get(key) for key in SUMMARY_KEYS}
        summary["path"] = f"{path.parent.name}/{path.name}"
        records[record["id"]] = summary
    index = {"records": records}
    save_index(index)
    return len(records)


if __name__ == "__main__":
    import sys

    if "--rebuild" in sys.argv:
        print(f"index rebuilt with {rebuild_index()} records")
    else:
        print(json.dumps(environment(), indent=1))
