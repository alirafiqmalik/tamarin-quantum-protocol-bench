"""BB84 prepare-and-measure, vectorized over rounds.

Exact facts used instead of a state vector:
  * a BB84 state measured in its preparation basis returns the prepared bit,
    in the other basis a uniform bit;
  * the depolarizing channel rho -> (1-p) rho + p I/2 flips a bit measured in
    the preparation basis with probability p/2.
"""

from __future__ import annotations

from typing import Any

import numpy as np


def resolve(strategy: str, schedule: dict[str, Any]) -> tuple[str, str]:
    """Map (strategy, schedule) to the effective behaviour and a note, like bb84Mode in TS."""
    if strategy == "none":
        return "honest", ""
    if strategy == "intercept-resend":
        return "intercept", "Eve guesses a basis for every qubit (QBER about 25 %)."
    if strategy == "v2-deferred":
        if schedule.get("basisOrder") == "B2A":
            return "intercept", "B2A: Bob announces first; V2 degrades to intercept-resend."
        if schedule.get("commitment") is True:
            return "intercept", "CM1 commitment: V2 degrades to intercept-resend."
        return "deferred", "V2: Eve measures in Alice's announced basis; QBER 0, key known."
    if strategy == "v3-reflection":
        if schedule.get("identityBound"):
            return "honest", "MAC binds identities; reflection rejected."
        return "reflect", "V3: announcements reflected; honest statistics, session with itself."
    raise ValueError(f"unknown strategy {strategy!r}")


def trial(rng: np.random.Generator, rounds: int, strategy: str, schedule: dict[str, Any],
          noise: float, threshold: float) -> dict[str, Any]:
    mode, note = resolve(strategy, schedule)
    n = rounds
    a_bit = rng.integers(0, 2, n)
    a_basis = rng.integers(0, 2, n)
    b_basis = rng.integers(0, 2, n)

    if mode == "intercept":
        e_basis = rng.integers(0, 2, n)
        e_bit = np.where(e_basis == a_basis, a_bit, rng.integers(0, 2, n))
        s_basis, s_bit = e_basis, e_bit
    else:
        # honest, deferred (measure in Alice's basis: no disturbance) and reflect
        s_basis, s_bit = a_basis, a_bit

    flip = rng.random(n) < noise / 2
    b_bit = np.where(b_basis == s_basis, s_bit ^ flip, rng.integers(0, 2, n))

    sifted = a_basis == b_basis
    errors = sifted & (a_bit != b_bit)
    if mode == "intercept":
        eve = sifted & (e_basis == a_basis)
    elif mode in ("deferred", "reflect"):
        eve = sifted
    else:
        eve = np.zeros(n, dtype=bool)

    ns = int(sifted.sum())
    qber = float(errors.sum() / ns) if ns else 0.0
    return {
        "mode": mode,
        "note": note,
        "shots": n,
        "sifted": ns,
        "errors": int(errors.sum()),
        "qber": qber,
        "eveKnows": float(eve.sum() / ns) if ns else 0.0,
        "detected": bool(ns and qber > threshold),
    }
