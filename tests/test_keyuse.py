"""WP4 key-use layer: every grid point parses; the decisive presets give the expected verdicts."""
import os
import subprocess
import unittest

from bench import registry
from bench.prove import prove_file

os.environ.setdefault("TAMARIN_CORES", "4")

PROTOCOL = "keyuse"
ALL = {"executable", "key_secret", "delivered_to_authorized", "single_delivery", "message_secret", "message_integrity"}

# preset id -> lemmas expected to fail; every other lemma must be verified.
EXPECTED = {
    "standard-compliant": set(),
    "plain-sae-channel": {"key_secret", "message_secret", "message_integrity"},
    "bearer-token": {"key_secret", "delivered_to_authorized", "message_secret", "message_integrity"},
    "two-time-pad": {"message_secret"},
}


def _preset(preset_id):
    return next(p for p in registry.spec(PROTOCOL)["presets"] if p["id"] == preset_id)


def _verdicts(result):
    return {row["name"]: row["verified"] for row in result["lemmas"]}


class GridParseTests(unittest.TestCase):
    def test_grid_has_32_points(self):
        self.assertEqual(len(registry.grid(PROTOCOL)), 32)

    def test_every_grid_point_parses_cleanly(self):
        for options in registry.grid(PROTOCOL):
            theory, path, _label = registry.assemble(PROTOCOL, registry.normalize(PROTOCOL, options))
            self.assertLess(theory.count("\n"), 220, path)
            # Loading without --prove runs the wellformedness checks (--parse-only skips them).
            proc = subprocess.run(
                ["tamarin-prover", "--quit-on-warning", "--derivcheck-timeout=0", str(path), "+RTS", "-N2", "-RTS"],
                capture_output=True, text=True, timeout=120,
            )
            self.assertEqual(proc.returncode, 0, f"{path}\n{proc.stdout[-800:]}\n{proc.stderr[-800:]}")
            self.assertNotIn("wellformedness checks failed", proc.stdout + proc.stderr, path)

    def test_lanes_cover_every_rule_prefix(self):
        lanes = dict(registry.lanes(PROTOCOL))
        self.assertEqual(set(lanes), {"alice", "bob", "kme_a", "kme_b", "eve", "channel"})
        theory, _path, _label = registry.assemble(PROTOCOL, registry.defaults(PROTOCOL))
        prefixes = [p for group in lanes.values() for p in group]
        for line in theory.splitlines():
            if line.startswith("rule "):
                name = line.split()[1].rstrip(":")
                self.assertTrue(any(name.startswith(p) for p in prefixes), name)


class PresetVerdictTests(unittest.TestCase):
    def _check(self, preset_id):
        preset = _preset(preset_id)
        options = registry.normalize(PROTOCOL, preset["options"])
        _theory, path, _label = registry.assemble(PROTOCOL, options)
        result = prove_file(path, heuristic="S", timeout=120, lanes=registry.lanes(PROTOCOL))
        self.assertFalse(result["timed_out"], preset_id)
        self.assertFalse(result["warning"], preset_id)
        verdicts = _verdicts(result)
        self.assertEqual(set(verdicts), ALL, preset_id)
        failed = {name for name, ok in verdicts.items() if not ok}
        self.assertEqual(failed, EXPECTED[preset_id], f"{preset_id}: {verdicts}")
        for row in result["lemmas"]:
            if row["name"] in failed:
                self.assertIsNotNone(row["trace"], row["name"])
        return result

    def test_standard_compliant_holds(self):
        self._check("standard-compliant")

    def test_plain_sae_channel_leaks_key(self):
        result = self._check("plain-sae-channel")
        trace = next(row["trace"] for row in result["lemmas"] if row["name"] == "key_secret")
        self.assertIn("kme_a", trace["lanes"])

    def test_bearer_token_key_id_delivers_to_eve(self):
        result = self._check("bearer-token")
        trace = next(row["trace"] for row in result["lemmas"] if row["name"] == "delivered_to_authorized")
        self.assertTrue(any("'E'" in action for event in trace["events"] for action in event["actions"]))

    def test_two_time_pad_leaks_messages(self):
        result = self._check("two-time-pad")
        trace = next(row["trace"] for row in result["lemmas"] if row["name"] == "message_secret")
        self.assertIn("eve", trace["lanes"])


if __name__ == "__main__":
    unittest.main()
