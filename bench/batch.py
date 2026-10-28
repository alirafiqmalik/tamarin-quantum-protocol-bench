"""Offline evidence generation: every protocol grid point, every lemma, one record each.

Usage: python3 -m bench.batch [--protocol ID] [--timeout SECONDS] [--heuristic S] [--redo] [--lemma NAME]
"""
import argparse
import sys
import time

from . import registry
from .manifest import load_index, model_hash, record_id, store_record
from .prove import prove_file


def run_point(protocol, options, heuristic, timeout, redo=False, only=None, log=None):
    log = log or (lambda msg: print(msg, flush=True))
    options = registry.all_lemma_options(protocol, options)
    theory, path, label = registry.assemble(protocol, options)
    lanes = registry.lanes(protocol)
    index = load_index()
    out = []
    for lemma in registry.lemmas(protocol, options):
        if only and lemma != only:
            continue
        rid = record_id(protocol, options, lemma, heuristic)
        existing = index["records"].get(rid)
        if existing and not redo and existing.get("status") not in (None, "timeout", "no result"):
            log(f"skip  {protocol} {label} {lemma} ({existing['status']})")
            out.append(rid)
            continue
        log(f"prove {protocol} {label} {lemma} (timeout {timeout}s)")
        started = time.time()
        result = prove_file(path, heuristic=heuristic, timeout=timeout, lemma=lemma, lanes=lanes, use_cache=not redo)
        row = next((r for r in result["lemmas"] if r["name"] == lemma), None)
        status = "timeout" if result["timed_out"] else (row["status"] if row else "no result")
        record = {
            "id": rid,
            "protocol": protocol,
            "options": options,
            "label": label,
            "lemma": lemma,
            "heuristic": heuristic,
            "status": status,
            "verified": bool(row and row["verified"]),
            "quantifier": row["quantifier"] if row else None,
            "steps": row["steps"] if row else None,
            "seconds": result["seconds"],
            "wall": result.get("wall"),
            "timed_out": result["timed_out"],
            "hash": model_hash(theory),
            "version": result["version"],
            "recorded": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "proof": row["proof"] if row else None,
            "trace": row["trace"] if row else None,
            "log": result["log"][-4000:],
            "theory_file": path.name,
        }
        store_record(record)
        index = load_index()
        log(f"      -> {status} in {result['seconds'] or round(time.time() - started, 1)}s")
        out.append(rid)
    return out


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", default=None)
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--heuristic", default="S")
    parser.add_argument("--redo", action="store_true")
    parser.add_argument("--lemma", default=None)
    parser.add_argument("--filter", action="append", default=[], help="key=value; keep grid points whose option matches (repeatable)")
    args = parser.parse_args(argv)
    filters = []
    for item in args.filter:
        key, _sep, value = item.partition("=")
        filters.append((key, value))
    protocols = [args.protocol] if args.protocol else registry.ids()
    for protocol in protocols:
        for options in registry.grid(protocol):
            if any(str(options.get(key)) != value for key, value in filters):
                continue
            run_point(protocol, options, args.heuristic, args.timeout, redo=args.redo, only=args.lemma)
    return 0


if __name__ == "__main__":
    sys.exit(main())
