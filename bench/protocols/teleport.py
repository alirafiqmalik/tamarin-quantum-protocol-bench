"""Quantum teleportation: an entangled pair, a Bell measurement, two classical correction bits.

Abstraction. A pair is a fresh name ~e. The two halves are linear facts PairA/PairB so a
half can be held by exactly one party at a time (no cloning). Alice's Bell measurement on
her state ~psi and her half yields the classical term bm(~psi, e). Bob recovers with
recover(half(e), bits), which reduces to psi only when bits = bm(psi, e) and he holds the
matching half. Every pair carries a public label ~sid (heralding label) so the correction
bits can be matched to a pair.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "work"

PROTOCOL = {
    "id": "teleport",
    "name": "Quantum teleportation",
    "group": "communication",
    "blurb": "Entangled pair from a source, Bell measurement at Alice, two correction bits to Bob over a classical channel. Toggles: MAC on the correction bits, trusted source.",
    "story": "The quantum step is one Bell measurement and one correction. Both failures live outside it: the correction bits are classical control, and the pair is the trust anchor. This is the two-party twin of V1 (subverted entanglement source).",
    "fields": [
        {"key": "auth", "label": "Authenticate the correction bits (MAC with a preshared key)", "kind": "bool", "default": True},
        {"key": "trusted_source", "label": "Trusted entanglement source", "kind": "bool", "default": True},
    ],
    "lemmas": [
        {"name": "executable", "kind": "exists-trace", "title": "Executability", "desc": "Bob recovers the state Alice teleported."},
        {"name": "state_secret", "kind": "all-traces", "title": "State secrecy", "desc": "A teleported state never enters attacker knowledge."},
        {"name": "state_integrity", "kind": "all-traces", "title": "State integrity", "desc": "Whatever Bob recovers was teleported by Alice earlier."},
    ],
    "presets": [
        {"id": "sound", "label": "MAC on, trusted source", "options": {"auth": True, "trusted_source": True}, "story": "All three lemmas hold."},
        {"id": "no-auth", "label": "No MAC, trusted source", "options": {"auth": False, "trusted_source": True}, "story": "The attacker replaces the correction bits; Bob applies a wrong correction. Integrity fails, secrecy holds."},
        {"id": "eve-source", "label": "MAC on, attacker source", "options": {"auth": True, "trusted_source": False}, "story": "The attacker knows the pair, reads the correction bits, and reconstructs the state. Secrecy fails, integrity holds."},
        {"id": "both", "label": "No MAC, attacker source", "options": {"auth": False, "trusted_source": False}, "story": "Both secrecy and integrity fail."},
    ],
    "standards": [
        {"clause": "Bennett, Brassard, Crépeau, Jozsa, Peres, Wootters, Phys. Rev. Lett. 70, 1895 (1993)", "text": "Teleporting an unknown quantum state via dual classical and EPR channels. The two classical bits are sent over an ordinary channel; the paper assumes nothing about its authentication."},
        {"clause": "ETSI GS QKD 004 V2.1.1 / ETSI GS QKD 014 V1.1.1", "text": "Key delivery interfaces that a teleportation-based link would sit under. They assume an authenticated classical control channel but do not define how the correction or sifting messages are bound to a session."},
        {"clause": "ETSI GR QKD 007 (vocabulary)", "text": "Defines the entanglement source as part of the trusted node boundary. Moving it outside that boundary is the untrusted-source toggle."},
    ],
    "lanes": [
        ["alice", ["Alice"]],
        ["bob", ["Bob"]],
        ["channel", ["Source", "Eve_Source", "Chan"]],
    ],
}


def theory_text(auth, trusted):
    name = "Teleport_" + ("auth" if auth else "plain") + "_" + ("trusted" if trusted else "evesource")
    source = """
/* Honest source: a fresh pair ~e with a public label ~sid. */
rule Source_Pair:
  [ Fr(~e), Fr(~sid) ]
  --[ SourcePair(~sid) ]->
  [ PairA(~sid, ~e), PairB(~sid, ~e), Out(~sid) ]
""" if trusted else """
/* Attacker-controlled source: the attacker chooses and therefore knows the pair. */
rule Eve_Source:
  [ In(<sid, e>) ]
  --[ SourcePair(sid) ]->
  [ PairA(sid, e), PairB(sid, e) ]
"""
    if auth:
        key = """
rule Chan_PSK:
  [ Fr(~k) ]
  --[ ]->
  [ !PSK(~k) ]
"""
        alice = """
rule Alice_Teleport:
  let bits = bm(~psi, e)
  in
  [ PairA(sid, e), Fr(~psi), !PSK(k) ]
  --[ Teleported('A', ~psi) ]->
  [ Out(<sid, bits>), Out(mac(<'A', 'B', sid, bits>, k)) ]
"""
        bob = """
rule Bob_Recover:
  let state = recover(half(e), bits)
  in
  [ PairB(sid, e), In(<sid, bits>), In(tag), !PSK(k) ]
  --[ Eq(verify(tag, k), <'A', 'B', sid, bits>), Recovered('B', state) ]->
  [ ]
"""
    else:
        key = ""
        alice = """
rule Alice_Teleport:
  let bits = bm(~psi, e)
  in
  [ PairA(sid, e), Fr(~psi) ]
  --[ Teleported('A', ~psi) ]->
  [ Out(<sid, bits>) ]
"""
        bob = """
rule Bob_Recover:
  let state = recover(half(e), bits)
  in
  [ PairB(sid, e), In(<sid, bits>) ]
  --[ Recovered('B', state) ]->
  [ ]
"""
    return f"""theory {name}
begin

/* Quantum states are terms. half(e) is Bob's half of pair e, bm(psi, e) the two
   classical bits of a Bell measurement, recover applies the correction. */
functions: half/1, bm/2, recover/2, mac/2, verify/2
equations:
  recover(half(e), bm(psi, e)) = psi,
  verify(mac(m, k), k) = m
{source}{key}{alice}{bob}
/* One pair per label: the label is a heralding tag, never reused. */
restriction UniquePair:
  "All s #i #j. SourcePair(s) @ i & SourcePair(s) @ j ==> #i = #j"

restriction Equality:
  "All x y #i. Eq(x, y) @ i ==> x = y"

lemma executable:
  exists-trace
  "Ex psi #i #j. Teleported('A', psi) @ i & Recovered('B', psi) @ j & #i < #j"

lemma state_secret:
  "All psi #i. Teleported('A', psi) @ i ==> not (Ex #j. K(psi) @ j)"

lemma state_integrity:
  "All psi #i. Recovered('B', psi) @ i ==> Ex #j. Teleported('A', psi) @ j & #j < #i"

end
"""


def _label(options):
    return ("MAC on" if options["auth"] else "no MAC") + " / " + ("trusted source" if options["trusted_source"] else "attacker source")


def assemble(options):
    auth = bool(options.get("auth", True))
    trusted = bool(options.get("trusted_source", True))
    theory = theory_text(auth, trusted)
    WORK.mkdir(exist_ok=True)
    path = WORK / f"teleport_{'auth' if auth else 'plain'}_{'trusted' if trusted else 'evesource'}.spthy"
    path.write_text(theory)
    return theory, path, _label({"auth": auth, "trusted_source": trusted})


def grid():
    return [
        {"auth": True, "trusted_source": True},
        {"auth": False, "trusted_source": True},
        {"auth": True, "trusted_source": False},
        {"auth": False, "trusted_source": False},
    ]
