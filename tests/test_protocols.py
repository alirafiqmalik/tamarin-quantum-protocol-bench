"""WP6 protocol modules: every grid point is wellformed, and the decisive verdicts hold.

The wellformedness pass runs `tamarin-prover --quit-on-warning FILE` (no --prove) for every
option combination of teleport, superdense, qss, and cka. The verdict pass proves the two
fastest decisive configurations per protocol with prove_file (heuristic S, 120 s).
"""
import os
import subprocess
import unittest

from bench import registry
from bench.prove import prove_file

MODULES = ["teleport", "superdense", "qss", "cka"]

# protocol -> [(options, {lemma: expected verified?})]
DECISIVE = {
    "teleport": [
        ({"auth": False, "trusted_source": True}, {"executable": True, "state_secret": True, "state_integrity": False}),
        ({"auth": True, "trusted_source": False}, {"executable": True, "state_secret": False, "state_integrity": True}),
    ],
    "superdense": [
        ({"trusted_source": True, "confirm": False}, {"executable": True, "message_secret": True, "message_integrity": False}),
        ({"trusted_source": False, "confirm": True}, {"executable": True, "message_secret": False, "message_integrity": True}),
    ],
    "qss": [
        ({"dealer_order": "first", "dishonest": "charlie"}, {"executable": True, "outsider_secret": True, "insider_alone": False}),
        ({"dealer_order": "last", "dishonest": "charlie"}, {"executable": True, "outsider_secret": True, "insider_alone": True}),
    ],
    "cka": [
        ({"psk_mode": "group", "identity_bound": False}, {"executable": True, "key_secret": True, "agreement_AB": False, "agreement_AC": False, "aliveness": False}),
        ({"psk_mode": "group", "identity_bound": True}, {"executable": True, "key_secret": True, "agreement_AB": True, "agreement_AC": True, "aliveness": True}),
    ],
}


def _tamarin_cmd(path):
    cmd = ["tamarin-prover", "--quit-on-warning", "--derivcheck-timeout=0", str(path)]
    cores = os.environ.get("TAMARIN_CORES")
    if cores and cores.isdigit():
        cmd += ["+RTS", f"-N{cores}", "-RTS"]
    return cmd


class CatalogTests(unittest.TestCase):
    def test_modules_registered_with_groups_and_lanes(self):
        catalog = {item["id"]: item for item in registry.catalog()["protocols"]}
        for name in MODULES:
            self.assertIn(name, catalog)
            spec = catalog[name]
            self.assertIn(spec["group"], ("communication", "multiparty"))
            self.assertTrue(spec["standards"])
            self.assertTrue(spec["presets"])
            self.assertTrue(registry.lanes(name))
            for lemma in spec["lemmas"]:
                self.assertIn(lemma["kind"], ("exists-trace", "all-traces"))
        self.assertEqual(catalog["teleport"]["group"], "communication")
        self.assertEqual(catalog["superdense"]["group"], "communication")
        self.assertEqual(catalog["qss"]["group"], "multiparty")
        self.assertEqual(catalog["cka"]["group"], "multiparty")

    def test_grid_covers_every_option_combination(self):
        for name in MODULES:
            fields = registry.spec(name)["fields"]
            expected = 1
            for field in fields:
                expected *= 2 if field["kind"] == "bool" else len(field["options"])
            grid = registry.grid(name)
            self.assertEqual(len(grid), expected, name)
            self.assertEqual(len({str(sorted(point.items())) for point in grid}), expected, name)
            for point in grid:
                self.assertEqual(registry.normalize(name, point), point)

    def test_presets_are_grid_points(self):
        for name in MODULES:
            grid = [registry.normalize(name, point) for point in registry.grid(name)]
            for preset in registry.spec(name)["presets"]:
                self.assertIn(registry.normalize(name, preset["options"]), grid, f"{name}:{preset['id']}")


class WellformednessTests(unittest.TestCase):
    def test_every_grid_point_parses_without_warning(self):
        for name in MODULES:
            for point in registry.grid(name):
                theory, path, _label = registry.assemble(name, point)
                self.assertLess(len(theory.splitlines()), 200, f"{name} {point}")
                for lemma in registry.lemmas(name, point):
                    self.assertIn(f"lemma {lemma}", theory)
                proc = subprocess.run(_tamarin_cmd(path), capture_output=True, text=True, timeout=120)
                self.assertEqual(proc.returncode, 0, f"{name} {point}: {proc.stdout[-800:]}")
                self.assertNotIn("wellformedness checks failed", proc.stdout, f"{name} {point}")
                self.assertNotIn("partial deconstructions", proc.stdout, f"{name} {point}")


class VerdictTests(unittest.TestCase):
    def _check(self, name, point, expected):
        _theory, path, label = registry.assemble(name, point)
        result = prove_file(path, heuristic="S", timeout=120, lanes=registry.lanes(name))
        self.assertFalse(result["timed_out"], f"{name} {label} timed out")
        self.assertFalse(result["warning"], f"{name} {label} warning")
        rows = {row["name"]: row for row in result["lemmas"]}
        self.assertEqual(set(rows), set(expected), f"{name} {label}")
        for lemma, verified in expected.items():
            self.assertEqual(rows[lemma]["verified"], verified, f"{name} {label} {lemma}: {rows[lemma]['status']}")
            if not verified:
                self.assertIn("falsified", rows[lemma]["status"])
                self.assertIsNotNone(rows[lemma]["trace"], f"{name} {label} {lemma} has no trace")
                self.assertTrue(rows[lemma]["trace"]["lanes"])

    def test_teleport(self):
        for point, expected in DECISIVE["teleport"]:
            self._check("teleport", point, expected)

    def test_superdense(self):
        for point, expected in DECISIVE["superdense"]:
            self._check("superdense", point, expected)

    def test_qss(self):
        for point, expected in DECISIVE["qss"]:
            self._check("qss", point, expected)

    def test_cka(self):
        for point, expected in DECISIVE["cka"]:
            self._check("cka", point, expected)


if __name__ == "__main__":
    unittest.main()
