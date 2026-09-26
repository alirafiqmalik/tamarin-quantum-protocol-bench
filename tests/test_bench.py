import unittest

from bench.assemble import assemble
from bench.learn import learn
from bench.ml_client import overview
from bench.prove import parse_summary, prove_file


SAMPLE = """
summary of summaries:

analyzed: x.spthy

  processing time: 0.17s

  executable (exists-trace): verified (6 steps)
  secret (all-traces): falsified - found trace (5 steps)
"""


class ParseTests(unittest.TestCase):
    def test_summary(self):
        parsed = parse_summary(SAMPLE)
        self.assertEqual(parsed["seconds"], 0.17)
        self.assertEqual(parsed["lemmas"][0]["name"], "executable")
        self.assertTrue(parsed["lemmas"][0]["verified"])
        self.assertFalse(parsed["lemmas"][1]["verified"])


class AssembleTests(unittest.TestCase):
    def test_qkd_names_the_family(self):
        theory, _path, label = assemble(
            "qkd",
            {
                "type": "PM",
                "adv": "Network",
                "er": "FEC",
                "bo": "SeqA",
                "exec": True,
                "secrecy": False,
                "auth": False,
            },
        )
        self.assertIn("theory PM_protocol", theory)
        self.assertIn("lemma executability_success", theory)
        self.assertNotIn("lemma secret_key_A", theory)
        self.assertIn("PM", label)

    def test_qsend_leak_outputs_the_key(self):
        theory, _path, _label = assemble("qsend", {"leak_key": True})
        self.assertIn("Out(k)", theory)
        self.assertIn("theory QuantumSendLeak", theory)


class ProveTests(unittest.TestCase):
    def test_qsend_sound_and_leak(self):
        _theory, sound, _label = assemble("qsend", {"leak_key": False})
        _theory, leak, _label = assemble("qsend", {"leak_key": True})
        held = prove_file(sound, heuristic="S", timeout=20)
        broken = prove_file(leak, heuristic="S", timeout=20)
        sound_names = {row["name"] for row in held["lemmas"] if row["verified"]}
        leak_failed = {row["name"] for row in broken["lemmas"] if not row["verified"]}
        self.assertEqual(sound_names, {"executable", "secret", "correspondence"})
        self.assertIn("secret", leak_failed)
        self.assertIn("correspondence", leak_failed)

    def test_search_prefers_key_off_channel(self):
        result = learn("qsend", {"leak_key": True}, timeout=20)
        self.assertEqual(result["best"]["abstraction"], "key off the channel")
        self.assertIn("Secret holds", result["note"])
        self.assertIn("secret fails", result["note"])


class ApiShapeTests(unittest.TestCase):
    def test_ml_port_is_reported(self):
        state = overview(timeout=0.5)
        self.assertIn("up", state)
        self.assertIsInstance(state["up"], bool)


if __name__ == "__main__":
    unittest.main()
