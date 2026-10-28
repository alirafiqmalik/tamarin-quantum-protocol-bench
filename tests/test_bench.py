import json
import unittest
from pathlib import Path

from bench import registry
from bench.learn import learn
from bench.manifest import model_hash, record_id, tamarin_version
from bench.prooftree import parse_proofs
from bench.prove import parse_summary, prove_file
from bench.trace import graph_to_msc, lemma_atoms

SAMPLE = """
summary of summaries:

analyzed: x.spthy

  processing time: 0.17s

  executable (exists-trace): verified (6 steps)
  secret (all-traces): falsified - found trace (5 steps)
"""

PROOF = """
lemma secret:
  all-traces "∀ m #i. (Secret( m ) @ #i) ⇒ (¬(∃ #j. K( m ) @ #j))"
/*
guarded formula characterizing all counter-examples:
"∃ m #i. (Secret( m ) @ #i) ∧ ∃ #j. (K( m ) @ #j)"
*/
simplify
solve( AliceKey( k ) ▶₀ #i )
  case ShareKey
  solve( !KU( ~msg ) @ #vk )
    case AliceSend
    by contradiction /* impossible chain */
  next
    case c_encode
    by contradiction /* cyclic */
  qed
qed

lemma executable:
  exists-trace
  "∃ m #i #j. (Sent( m ) @ #i) ∧ (Recv( m ) @ #j) ∧ (#i < #j)"
simplify
solve( AliceKey( k ) ▶₀ #i )
  case ShareKey
  solve( BobKey( k ) ▶₀ #j )
    case ShareKey
    SOLVED // trace found
  qed
qed

end
"""


class ParseTests(unittest.TestCase):
    def test_summary(self):
        parsed = parse_summary(SAMPLE)
        self.assertEqual(parsed["seconds"], 0.17)
        self.assertEqual(parsed["lemmas"][0]["name"], "executable")
        self.assertTrue(parsed["lemmas"][0]["verified"])
        self.assertFalse(parsed["lemmas"][1]["verified"])

    def test_proof_tree(self):
        trees = parse_proofs(PROOF)
        self.assertEqual(set(trees), {"secret", "executable"})
        self.assertEqual(trees["secret"]["status"], "closed")
        self.assertEqual(trees["executable"]["status"], "trace")
        kinds = [item["kind"] for item in trees["secret"]["order"]]
        self.assertEqual(kinds.count("case"), 3)
        self.assertEqual(kinds.count("leaf"), 2)
        # every entry names its parent earlier in the order
        for item in trees["secret"]["order"][1:]:
            self.assertLess(item["p"], item["i"])

    def test_lemma_atoms(self):
        theory = 'lemma secret:\n  "All m #i. Secret(m) @ i ==> not (Ex #j. K(m) @ j)"\n'
        self.assertEqual(lemma_atoms(theory, "secret"), ["K", "Secret"])

    def test_graph_to_msc(self):
        graph = {
            "jgLabel": "t",
            "jgNodes": [
                {"jgnId": "#a", "jgnType": "isProtocolRule", "jgnLabel": "Alice_Send", "jgnMetadata": {
                    "jgnActs": [{"jgnFactShow": "Sent( ~m )"}],
                    "jgnConcs": [{"jgnFactId": "#a:c0", "jgnFactName": "Out", "jgnFactShow": "Out( ~m )"}],
                    "jgnPrems": []}},
                {"jgnId": "#k", "jgnType": "isIntruderRule", "jgnLabel": "Recv", "jgnMetadata": {
                    "jgnActs": [], "jgnConcs": [{"jgnFactId": "#k:c0", "jgnFactName": "!KD", "jgnFactShow": "!KD( ~m )"}],
                    "jgnPrems": [{"jgnFactId": "#k:p0", "jgnFactName": "Out", "jgnFactShow": "Out( ~m )"}]}},
                {"jgnId": "#b", "jgnType": "isProtocolRule", "jgnLabel": "Bob_Recv", "jgnMetadata": {
                    "jgnActs": [{"jgnFactShow": "Recv( ~m )"}], "jgnConcs": [],
                    "jgnPrems": [{"jgnFactId": "#b:p0", "jgnFactName": "In", "jgnFactShow": "In( ~m )"}]}},
            ],
            "jgEdges": [
                {"jgeRelation": "KFact", "jgeSource": "#a:c0", "jgeTarget": "#k:p0"},
                {"jgeRelation": "KFact", "jgeSource": "#k:c0", "jgeTarget": "#b:p0"},
            ],
        }
        msc = graph_to_msc(graph, lemma_atoms=["Recv"])
        self.assertEqual([e["lane"] for e in msc["events"]], ["alice", "attacker", "bob"])
        self.assertEqual(msc["violation"], ["#b"])
        self.assertEqual([m["channel"] for m in msc["messages"]], ["public", "public"])


class RegistryTests(unittest.TestCase):
    def test_catalog_lists_groups_and_lemmas(self):
        catalog = registry.catalog()
        ids = {item["id"] for item in catalog["protocols"]}
        self.assertIn("qkd", ids)
        qkd = next(item for item in catalog["protocols"] if item["id"] == "qkd")
        self.assertTrue(any(l["name"] == "secret_key_A" for l in qkd["lemmas"]))
        self.assertEqual(len(registry.grid("qkd")), 36)

    def test_normalize_defaults_and_rejects(self):
        options = registry.normalize("qkd", {"type": "EB"})
        self.assertEqual(options["type"], "EB")
        self.assertEqual(options["er"], "FEC")
        with self.assertRaises(ValueError):
            registry.normalize("qkd", {"type": "XX"})

    def test_qkd_names_the_family(self):
        theory, _path, label = registry.assemble(
            "qkd",
            {"type": "PM", "adv": "Network", "er": "FEC", "bo": "SeqA", "exec": True, "secrecy": False, "auth": False},
        )
        self.assertIn("theory PM_protocol", theory)
        self.assertIn("lemma executability_success", theory)
        self.assertNotIn("lemma secret_key_A", theory)
        self.assertIn("PM", label)
        self.assertEqual(registry.lemmas("qkd", {"exec": True, "secrecy": False, "auth": False}), ["executability_success"])

    def test_qsend_leak_outputs_the_key(self):
        theory, _path, _label = registry.assemble("qsend", {"leak_key": True})
        self.assertIn("Out(k)", theory)
        self.assertIn("theory QuantumSendLeak", theory)

    def test_manifest_helpers(self):
        self.assertEqual(len(model_hash("x")), 64)
        self.assertEqual(record_id("a", {"x": 1}, "l", "S"), record_id("a", {"x": 1}, "l", "S"))
        self.assertIsInstance(tamarin_version(), str)


class ProveTests(unittest.TestCase):
    def test_qsend_sound_and_leak_with_artifacts(self):
        _theory, sound, _label = registry.assemble("qsend", {"leak_key": False})
        _theory, leak, _label = registry.assemble("qsend", {"leak_key": True})
        held = prove_file(sound, heuristic="S", timeout=30, lanes=registry.lanes("qsend"))
        broken = prove_file(leak, heuristic="S", timeout=30, lanes=registry.lanes("qsend"))
        sound_names = {row["name"] for row in held["lemmas"] if row["verified"]}
        leak_failed = {row["name"] for row in broken["lemmas"] if not row["verified"]}
        self.assertEqual(sound_names, {"executable", "secret", "correspondence"})
        self.assertIn("secret", leak_failed)
        self.assertIn("correspondence", leak_failed)
        secret = next(row for row in broken["lemmas"] if row["name"] == "secret")
        self.assertIsNotNone(secret["trace"])
        self.assertIn("alice", secret["trace"]["lanes"])
        self.assertTrue(secret["violation"] if "violation" in secret else secret["trace"]["violation"])
        self.assertEqual(secret["proof"]["status"], "trace")
        held_secret = next(row for row in held["lemmas"] if row["name"] == "secret")
        self.assertIsNone(held_secret["trace"])
        self.assertEqual(held_secret["proof"]["status"], "closed")
        self.assertEqual(held["version"], tamarin_version())

    def test_single_lemma_run(self):
        _theory, leak, _label = registry.assemble("qsend", {"leak_key": True})
        result = prove_file(leak, heuristic="S", timeout=30, lemma="secret", lanes=registry.lanes("qsend"))
        self.assertEqual([row["name"] for row in result["lemmas"] if row["status"] != "not run"], ["secret"])
        self.assertEqual(result["lemma"], "secret")

    def test_compare_prefers_key_off_channel(self):
        result = learn("qsend", {"leak_key": True}, timeout=30)
        self.assertEqual(result["best"]["abstraction"], "key off the channel")
        self.assertIn("Secret holds", result["note"])
        self.assertIn("secret fails", result["note"])


if __name__ == "__main__":
    unittest.main()
