"""Superdense coding: two classical bits in one qubit, with a shared entangled pair.

Abstraction. A pair ~e has halves halfA(e) and halfB(e) held in linear facts. Alice
encodes her two fresh bits ~m into her half: encodeSD(halfA(e), m). The encoded qubit
travels on a quantum channel modeled as a linear fact (Quantum) that the attacker may
forward, measure (consume), or replace by a state she prepared herself. Bob decodes with
decodeSD(q, halfB(e)), which reduces to m only for q = encodeSD(halfA(e), m). Bob cannot
tell a garbage decoding from a good one; that is why he records the irreducible term.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "work"

PROTOCOL = {
    "id": "superdense",
    "name": "Superdense coding",
    "group": "communication",
    "blurb": "Alice encodes two classical bits in her half of an entangled pair and sends the qubit. Toggles: trusted source, classical confirmation MAC.",
    "story": "The quantum channel carries the message but is not authenticated: the attacker can swap the qubit. An attacker-controlled source reads the message outright. A classical confirmation MAC restores integrity, never secrecy.",
    "fields": [
        {"key": "trusted_source", "label": "Trusted entanglement source", "kind": "bool", "default": True},
        {"key": "confirm", "label": "Classical confirmation MAC on h(m)", "kind": "bool", "default": False},
    ],
    "lemmas": [
        {"name": "executable", "kind": "exists-trace", "title": "Executability", "desc": "Bob decodes the bits Alice sent."},
        {"name": "message_secret", "kind": "all-traces", "title": "Message secrecy", "desc": "The encoded bits never enter attacker knowledge."},
        {"name": "message_integrity", "kind": "all-traces", "title": "Message integrity", "desc": "Whatever Bob decodes was sent by Alice earlier."},
    ],
    "presets": [
        {"id": "plain", "label": "Trusted source, no confirmation", "options": {"trusted_source": True, "confirm": False}, "story": "Secrecy holds. Integrity fails: the attacker swaps the qubit and Bob decodes garbage without noticing."},
        {"id": "confirm", "label": "Trusted source, confirmation MAC", "options": {"trusted_source": True, "confirm": True}, "story": "All three lemmas hold."},
        {"id": "eve-source", "label": "Attacker source, no confirmation", "options": {"trusted_source": False, "confirm": False}, "story": "The attacker holds a copy of Bob's half and decodes the message. Both secrecy and integrity fail."},
        {"id": "eve-source-confirm", "label": "Attacker source, confirmation MAC", "options": {"trusted_source": False, "confirm": True}, "story": "The MAC restores integrity but the attacker still reads the message."},
    ],
    "standards": [
        {"clause": "Bennett and Wiesner, Phys. Rev. Lett. 69, 2881 (1992)", "text": "Communication via one- and two-particle operators on EPR states. The qubit carrying the two bits travels on a bare quantum channel."},
        {"clause": "ETSI GR QKD 007 (vocabulary)", "text": "The entanglement source is inside the trusted boundary. The toggle moves it outside."},
        {"clause": "ITU-T FG QIT4N D2.3.1", "text": "Authentication of classical post-processing messages by MAC. The confirmation toggle applies the same mechanism to a data message."},
    ],
    "lanes": [
        ["alice", ["Alice"]],
        ["bob", ["Bob"]],
        ["channel", ["Source", "Eve_Source", "Chan"]],
        ["eve", ["Eve"]],
    ],
}


def theory_text(trusted, confirm):
    name = "Superdense_" + ("trusted" if trusted else "evesource") + "_" + ("confirm" if confirm else "plain")
    source = """
rule Source_Pair:
  [ Fr(~e), Fr(~sid) ]
  --[ SourcePair(~sid) ]->
  [ PairA(~sid, halfA(~e)), PairB(~sid, halfB(~e)), Out(~sid) ]
""" if trusted else """
/* Attacker-controlled source: the attacker knows e and can build halfB(e) herself. */
rule Eve_Source:
  [ In(<sid, e>) ]
  --[ SourcePair(sid) ]->
  [ PairA(sid, halfA(e)), PairB(sid, halfB(e)) ]
"""
    if confirm:
        key = """
rule Chan_PSK:
  [ Fr(~k) ]
  --[ ]->
  [ !PSK(~k) ]
"""
        alice = """
rule Alice_Encode:
  [ PairA(sid, hA), Fr(~m), !PSK(k) ]
  --[ Sent(~m) ]->
  [ QOut(sid, encodeSD(hA, ~m)), Out(mac(<'A', 'B', sid, h(~m)>, k)) ]
"""
        bob = """
rule Bob_Decode:
  let m = decodeSD(q, hB)
  in
  [ PairB(sid, hB), QIn(sid, q), In(tag), !PSK(k) ]
  --[ Eq(verify(tag, k), <'A', 'B', sid, h(m)>), Decoded(m) ]->
  [ ]
"""
    else:
        key = ""
        alice = """
rule Alice_Encode:
  [ PairA(sid, hA), Fr(~m) ]
  --[ Sent(~m) ]->
  [ QOut(sid, encodeSD(hA, ~m)) ]
"""
        bob = """
rule Bob_Decode:
  [ PairB(sid, hB), QIn(sid, q) ]
  --[ Decoded(decodeSD(q, hB)) ]->
  [ ]
"""
    return f"""theory {name}
begin

/* halfA(e)/halfB(e) are the two halves of pair e; encodeSD applies Alice's
   Pauli operation for bits m; decodeSD is Bob's Bell measurement. */
functions: halfA/1, halfB/1, encodeSD/2, decodeSD/2, mac/2, verify/2, h/1
equations:
  decodeSD(encodeSD(halfA(e), m), halfB(e)) = m,
  verify(mac(m, k), k) = m
{source}{key}{alice}{bob}
/* Quantum channel: a qubit in flight is one linear fact. The attacker can
   forward it, consume it by measuring, or put a state she prepared herself in
   front of Bob. Measuring her own state teaches her nothing, so injected
   states go straight to Bob's input. */
rule Chan_QOut:
  [ QOut(sid, q) ]
  --[ ]->
  [ Quantum(sid, q) ]

rule Chan_QIn:
  [ Quantum(sid, q) ]
  --[ ]->
  [ QIn(sid, q) ]

rule Eve_Measure:
  [ Quantum(sid, q), In(hb) ]
  --[ EveMeasure(sid) ]->
  [ Out(decodeSD(q, hb)) ]

rule Eve_Inject:
  [ In(<sid, x>) ]
  --[ EveInject(sid) ]->
  [ QIn(sid, x) ]

restriction UniquePair:
  "All s #i #j. SourcePair(s) @ i & SourcePair(s) @ j ==> #i = #j"

restriction Equality:
  "All x y #i. Eq(x, y) @ i ==> x = y"

lemma executable:
  exists-trace
  "Ex m #i #j. Sent(m) @ i & Decoded(m) @ j & #i < #j
     & not (Ex s #k. EveInject(s) @ k) & not (Ex s #k. EveMeasure(s) @ k)"

lemma message_secret:
  "All m #i. Sent(m) @ i ==> not (Ex #j. K(m) @ j)"

lemma message_integrity:
  "All m #i. Decoded(m) @ i ==> Ex #j. Sent(m) @ j & #j < #i"

end
"""


def _label(trusted, confirm):
    return ("trusted source" if trusted else "attacker source") + " / " + ("confirmation MAC" if confirm else "no confirmation")


def assemble(options):
    trusted = bool(options.get("trusted_source", True))
    confirm = bool(options.get("confirm", False))
    theory = theory_text(trusted, confirm)
    WORK.mkdir(exist_ok=True)
    path = WORK / f"superdense_{'trusted' if trusted else 'evesource'}_{'confirm' if confirm else 'plain'}.spthy"
    path.write_text(theory)
    return theory, path, _label(trusted, confirm)


def grid():
    return [
        {"trusted_source": True, "confirm": False},
        {"trusted_source": True, "confirm": True},
        {"trusted_source": False, "confirm": False},
        {"trusted_source": False, "confirm": True},
    ]
