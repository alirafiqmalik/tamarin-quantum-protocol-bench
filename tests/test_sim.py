"""Thresholds for the numpy cross-check simulator (mirrors web/src/sim/sim.test.ts)."""

import json
import subprocess
import sys
import unittest
from pathlib import Path

from sim import run

ROOT = Path(__file__).resolve().parent.parent


def go(protocol, strategy, schedule=None, noise=0.0, rounds=4096, trials=8, seed=5):
    return run(protocol, strategy, rounds=rounds, trials=trials, schedule=schedule, noise=noise, seed=seed)


class Bb84(unittest.TestCase):
    def test_honest(self):
        r = go("bb84", "none")
        self.assertLess(r["qber_mean"], 0.02)
        self.assertEqual(r["eve_knows_mean"], 0.0)
        self.assertEqual(r["detection_rate"], 0.0)

    def test_noise(self):
        r = go("bb84", "none", noise=0.1)
        self.assertAlmostEqual(r["qber_mean"], 0.05, delta=0.02)

    def test_intercept_resend(self):
        r = go("bb84", "intercept-resend")
        self.assertGreaterEqual(r["qber_mean"], 0.20)
        self.assertLessEqual(r["qber_mean"], 0.30)
        self.assertEqual(r["detection_rate"], 1.0)
        self.assertAlmostEqual(r["eve_knows_mean"], 0.5, delta=0.05)

    def test_v2_a2b(self):
        r = go("bb84", "v2-deferred", {"basisOrder": "A2B"})
        self.assertLess(r["qber_mean"], 0.02)
        self.assertGreater(r["eve_knows_mean"], 0.98)
        self.assertEqual(r["detection_rate"], 0.0)

    def test_v2_degrades(self):
        for sched in ({"basisOrder": "B2A"}, {"basisOrder": "A2B", "commitment": True}):
            r = go("bb84", "v2-deferred", sched)
            self.assertEqual(r["mode"], "intercept")
            self.assertGreater(r["qber_mean"], 0.2)
            self.assertEqual(r["detection_rate"], 1.0)

    def test_v3(self):
        r = go("bb84", "v3-reflection", {"authenticated": True})
        self.assertLess(r["qber_mean"], 0.02)
        self.assertEqual(r["eve_knows_mean"], 1.0)
        r = go("bb84", "v3-reflection", {"authenticated": True, "identityBound": True})
        self.assertEqual(r["eve_knows_mean"], 0.0)
        self.assertIn("reflection rejected", r["note"])


class Ebqkd(unittest.TestCase):
    def test_honest(self):
        r = go("ebqkd", "none", rounds=8192)
        self.assertLess(r["qber_mean"], 0.02)
        self.assertGreater(r["chsh_mean"], 2.6)
        self.assertEqual(r["bell_detection_rate"], 0.0)

    def test_intercept_resend(self):
        r = go("ebqkd", "intercept-resend", rounds=8192)
        self.assertAlmostEqual(r["qber_mean"], 0.25, delta=0.04)
        self.assertLess(r["chsh_mean"], 2.0)

    def test_v1_injection(self):
        r = go("ebqkd", "v1-injection", rounds=8192)
        self.assertLess(r["qber_mean"], 0.02)
        self.assertGreater(r["eve_knows_mean"], 0.98)
        self.assertEqual(r["detection_rate"], 0.0)
        self.assertLess(r["chsh_mean"], 2.0)
        self.assertEqual(r["bell_detection_rate"], 1.0)

    def test_v1_injection_leaked_settings(self):
        r = go("ebqkd", "v1-injection", {"commitment": False}, rounds=8192)
        self.assertLess(r["qber_mean"], 0.02)
        self.assertGreater(r["eve_knows_mean"], 0.98)
        self.assertGreater(r["chsh_mean"], 2.6)


class Engine(unittest.TestCase):
    def test_determinism(self):
        a = go("ebqkd", "intercept-resend", noise=0.03, seed=9)
        b = go("ebqkd", "intercept-resend", noise=0.03, seed=9)
        self.assertEqual(a, b)
        c = go("ebqkd", "intercept-resend", noise=0.03, seed=10)
        self.assertNotEqual(a["qber_mean"], c["qber_mean"])

    def test_cli_json(self):
        out = subprocess.run(
            [sys.executable, "-m", "sim", "--protocol", "bb84", "--strategy", "v2-deferred",
             "--rounds", "1024", "--trials", "4", "--json"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout
        data = json.loads(out)
        self.assertEqual(data["strategy"], "v2-deferred")
        self.assertGreater(data["eve_knows_mean"], 0.98)
        self.assertLess(data["qber_mean"], 0.02)
        self.assertIn("detection_rate", data)


if __name__ == "__main__":
    unittest.main()
