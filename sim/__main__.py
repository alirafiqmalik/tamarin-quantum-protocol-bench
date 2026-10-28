"""CLI: python3 -m sim --protocol bb84 --strategy v2-deferred --rounds 4096 --trials 20 --json"""

from __future__ import annotations

import argparse
import json
import sys

from . import STRATEGIES, run


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python3 -m sim", description=__doc__)
    p.add_argument("--protocol", choices=sorted(STRATEGIES), default="bb84")
    p.add_argument("--strategy", default="none")
    p.add_argument("--rounds", type=int, default=4096)
    p.add_argument("--trials", type=int, default=20)
    p.add_argument("--noise", type=float, default=0.0, help="depolarizing probability per qubit")
    p.add_argument("--threshold", type=float, default=0.10)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--basis-order", choices=["A2B", "B2A", "none"], default="A2B")
    p.add_argument("--commitment", dest="commitment", action="store_true", default=None,
                   help="CM1: measurement commitment before basis announcement")
    p.add_argument("--no-commitment", dest="commitment", action="store_false",
                   help="ebqkd: all settings announced before Alice measures")
    p.add_argument("--unauthenticated", dest="authenticated", action="store_false", default=True)
    p.add_argument("--identity-bound", action="store_true", help="CM2: MAC binds identities")
    p.add_argument("--json", action="store_true")
    a = p.parse_args(argv)

    if a.strategy not in STRATEGIES[a.protocol]:
        p.error(f"strategy {a.strategy!r} not available for {a.protocol}: {STRATEGIES[a.protocol]}")
    schedule = {
        "basisOrder": a.basis_order,
        "commitment": a.commitment,
        "authenticated": a.authenticated,
        "identityBound": a.identity_bound,
    }
    out = run(a.protocol, a.strategy, a.rounds, a.trials, schedule, a.noise, a.threshold, a.seed)
    if a.json:
        json.dump(out, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        print(f"{out['protocol']} / {out['strategy']} ({out['mode']}) rounds={a.rounds} trials={a.trials}")
        print(f"  QBER       {out['qber_mean']:.4f} +- {out['qber_std']:.4f}")
        print(f"  eve knows  {out['eve_knows_mean']:.4f}")
        print(f"  detected   {out['detection_rate']:.2f} of trials (threshold {a.threshold})")
        if "chsh_mean" in out:
            print(f"  CHSH S     {out['chsh_mean']:.3f} +- {out['chsh_std']:.3f}  (S<2 in {out['bell_detection_rate']:.2f} of trials)")
        if out["note"]:
            print(f"  note: {out['note']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
