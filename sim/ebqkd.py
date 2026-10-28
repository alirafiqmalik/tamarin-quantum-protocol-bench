"""Entanglement-based QKD (BBM92 with CHSH test rounds), vectorized over rounds.

Exact facts used instead of a state vector:
  * two parties measuring |Phi+> at Bloch angles a, b (X-Z plane) get
    uniform outcomes with P(same) = cos^2((a-b)/2), i.e. E(a,b) = cos(a-b);
  * a qubit prepared as the eigenstate (angle e, bit o) and measured at
    angle a returns o with probability cos^2((a-e)/2);
  * depolarizing one qubit with probability p multiplies every correlation
    by (1-p), which is the same as flipping that outcome with probability p/2.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np

TEST_FRACTION = 0.25
ALICE_TEST = np.array([0.0, math.pi / 2])
BOB_TEST = np.array([math.pi / 4, -math.pi / 4])
KEY = np.array([0.0, math.pi / 2])  # Z, X


def resolve(strategy: str, schedule: dict[str, Any]) -> tuple[str, str]:
    if strategy == "none":
        return "honest", ""
    if strategy == "intercept-resend":
        return "intercept", "Eve measures Bob's qubit in a random basis and resends."
    if strategy == "v1-injection":
        if schedule.get("commitment") is False:
            return "inject", "V1 with all settings announced first: passes QBER and CHSH."
        return "inject", "V1: QBER 0 and key known; CHSH test settings withheld, S <= 2."
    raise ValueError(f"unknown strategy {strategy!r}")


def _correlated(rng: np.random.Generator, ref: np.ndarray, delta: np.ndarray) -> np.ndarray:
    """Outcome equal to `ref` with probability cos^2(delta/2)."""
    same = rng.random(ref.shape[0]) < np.cos(delta / 2) ** 2
    return np.where(same, ref, 1 - ref)


def _flip(rng: np.random.Generator, bits: np.ndarray, p: float) -> np.ndarray:
    if p <= 0:
        return bits
    return bits ^ (rng.random(bits.shape[0]) < p / 2)


def trial(rng: np.random.Generator, rounds: int, strategy: str, schedule: dict[str, Any],
          noise: float, threshold: float) -> dict[str, Any]:
    mode, note = resolve(strategy, schedule)
    leak_all = schedule.get("commitment") is False
    n = rounds
    test = rng.random(n) < TEST_FRACTION
    a_idx = rng.integers(0, 2, n)
    b_idx = rng.integers(0, 2, n)
    a_ang = np.where(test, ALICE_TEST[a_idx], KEY[a_idx])
    b_ang = np.where(test, BOB_TEST[b_idx], KEY[b_idx])

    if mode == "inject":
        # Bob measures his half of Eve's pair; Eve measures hers in the basis she learns.
        b_bit = rng.integers(0, 2, n)
        e_ang = np.where(test & ~leak_all, 0.0, b_ang)
        e_bit = _correlated(rng, _flip(rng, b_bit, noise), b_ang - e_ang)
        a_bit = _flip(rng, _correlated(rng, e_bit, a_ang - e_ang), noise)
        eve_basis_ok = np.ones(n, dtype=bool)
    elif mode == "intercept":
        e_idx = rng.integers(0, 2, n)
        e_ang = KEY[e_idx]
        a_bit = rng.integers(0, 2, n)
        e_bit = _correlated(rng, a_bit, a_ang - e_ang)
        b_bit = _correlated(rng, e_bit, b_ang - e_ang)
        a_bit = _flip(rng, a_bit, noise)
        b_bit = _flip(rng, b_bit, noise)
        eve_basis_ok = e_idx == b_idx
    else:
        a_bit = rng.integers(0, 2, n)
        b_bit = _correlated(rng, a_bit, a_ang - b_ang)
        a_bit = _flip(rng, a_bit, noise)
        b_bit = _flip(rng, b_bit, noise)
        eve_basis_ok = np.zeros(n, dtype=bool)

    key = ~test
    sifted = key & (a_idx == b_idx)
    errors = sifted & (a_bit != b_bit)
    eve = sifted & eve_basis_ok

    prod = np.where(a_bit == b_bit, 1.0, -1.0)
    chsh = math.nan
    E = np.zeros((2, 2))
    full = True
    for a in (0, 1):
        for b in (0, 1):
            m = test & (a_idx == a) & (b_idx == b)
            if m.any():
                E[a, b] = prod[m].mean()
            else:
                full = False
    if full:
        chsh = float(E[0, 0] + E[0, 1] + E[1, 0] - E[1, 1])

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
        "chsh": chsh,
        "testRounds": int(test.sum()),
    }
