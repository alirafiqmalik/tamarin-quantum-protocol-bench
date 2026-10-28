"""
Numpy cross-check of the browser quantum-protocol simulator (web/src/sim).

The browser code works on state vectors. This package uses the closed-form
measurement statistics of the same states (BB84 states, |Phi+>) instead, so
agreement between the two is a genuine cross-check of the numbers in the
paper. Only numpy is required.

    python3 -m sim --protocol bb84 --strategy v2-deferred --rounds 4096 --trials 20 --json
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from . import bb84, ebqkd

PROTOCOLS = {"bb84": bb84, "ebqkd": ebqkd}

STRATEGIES = {
    "bb84": ["none", "intercept-resend", "v2-deferred", "v3-reflection"],
    "ebqkd": ["none", "intercept-resend", "v1-injection"],
}


def default_schedule() -> dict[str, Any]:
    return {
        "basisOrder": "A2B",
        "commitment": None,
        "authenticated": True,
        "identityBound": False,
    }


def run(
    protocol: str,
    strategy: str,
    rounds: int = 4096,
    trials: int = 20,
    schedule: dict[str, Any] | None = None,
    noise: float = 0.0,
    threshold: float = 0.10,
    seed: int = 1,
) -> dict[str, Any]:
    """Run `trials` independent trials of `rounds` rounds and summarize them."""
    if protocol not in PROTOCOLS:
        raise ValueError(f"unknown protocol {protocol!r}")
    sched = default_schedule()
    sched.update(schedule or {})
    mod = PROTOCOLS[protocol]
    rng = np.random.default_rng(seed)
    results = [mod.trial(rng, rounds, strategy, sched, noise, threshold) for _ in range(trials)]
    qber = np.array([t["qber"] for t in results])
    eve = np.array([t["eveKnows"] for t in results])
    detected = np.array([t["detected"] for t in results], dtype=bool)
    out: dict[str, Any] = {
        "protocol": protocol,
        "strategy": strategy,
        "mode": results[0]["mode"],
        "note": results[0]["note"],
        "schedule": sched,
        "noise": noise,
        "threshold": threshold,
        "seed": seed,
        "rounds": rounds,
        "trials": trials,
        "sifted_mean": float(np.mean([t["sifted"] for t in results])),
        "qber_mean": float(qber.mean()),
        "qber_std": float(qber.std()),
        "eve_knows_mean": float(eve.mean()),
        "detection_rate": float(detected.mean()),
    }
    if "chsh" in results[0]:
        chsh = np.array([t["chsh"] for t in results], dtype=float)
        ok = ~np.isnan(chsh)
        out["chsh_mean"] = float(chsh[ok].mean()) if ok.any() else math.nan
        out["chsh_std"] = float(chsh[ok].std()) if ok.any() else math.nan
        out["bell_detection_rate"] = float(np.mean(chsh[ok] < 2)) if ok.any() else math.nan
    return out


__all__ = ["run", "PROTOCOLS", "STRATEGIES", "default_schedule", "bb84", "ebqkd"]
