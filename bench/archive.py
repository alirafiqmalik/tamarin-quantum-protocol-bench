"""Write the static archive bundle: static/catalog.json and static/evidence/.

Usage: python3 -m bench.archive [--out DIR]
The bundle lets the built front end run from any static host with no server.
"""
import argparse
import json
import shutil
from pathlib import Path

from . import registry
from .manifest import EVIDENCE, load_index

ROOT = Path(__file__).resolve().parents[1]


def build(out=None):
    out = Path(out) if out else ROOT / "static"
    out.mkdir(parents=True, exist_ok=True)
    (out / "catalog.json").write_text(json.dumps(registry.catalog(), indent=1))
    target = out / "evidence"
    if target.exists():
        shutil.rmtree(target)
    if EVIDENCE.exists():
        shutil.copytree(EVIDENCE, target)
    else:
        target.mkdir()
        (target / "index.json").write_text(json.dumps(load_index(), indent=1))
    count = len(load_index().get("records", {}))
    return out, count


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=None)
    args = parser.parse_args(argv)
    out, count = build(args.out)
    print(f"archive written to {out} with {count} evidence records")


if __name__ == "__main__":
    main()
