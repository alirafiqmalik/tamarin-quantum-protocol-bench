"""Illustrative send model: a preshared key, one encoded message, one MAC."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "work"

PROTOCOL = {
    "id": "qsend",
    "name": "Quantum send (illustrative)",
    "group": "keyuse",
    "blurb": "A preshared key, one encoded message, and a MAC. Placing the key on the channel is the abstraction under test.",
    "story": "A minimal model that shows how one extra Out fact changes two verdicts while executability stays.",
    "fields": [
        {"key": "leak_key", "label": "Put the key on the channel", "kind": "bool", "default": False},
    ],
    "lemmas": [
        {"name": "executable", "kind": "exists-trace", "title": "Executability", "desc": "A message is sent and then received."},
        {"name": "secret", "kind": "all-traces", "title": "Message secrecy", "desc": "A sent message never enters attacker knowledge."},
        {"name": "correspondence", "kind": "all-traces", "title": "Message correspondence", "desc": "Every received message was sent earlier."},
    ],
    "presets": [
        {"id": "sound", "label": "Key stays off the channel", "options": {"leak_key": False}, "story": "All three lemmas hold."},
        {"id": "leak", "label": "Key goes on the channel", "options": {"leak_key": True}, "story": "Secrecy and correspondence fail; executability stays."},
    ],
    "standards": [],
    "lanes": [["alice", ["Alice"]], ["bob", ["Bob"]], ["channel", ["ShareKey"]]],
}


def theory_text(leak_key):
    name = "QuantumSendLeak" if leak_key else "QuantumSend"
    outs = "Out(encode(~msg, k)), Out(mac(~msg, k))"
    if leak_key:
        outs += ", Out(k)"
    return f"""theory {name}
begin

functions: encode/2, measure/2, mac/2, verify/2
equations:
  measure(encode(m, k), k) = m,
  verify(mac(m, k), k) = m

rule ShareKey:
  [ Fr(~k) ]
  --[ ]->
  [ AliceKey(~k), BobKey(~k) ]

rule AliceSend:
  [ AliceKey(k), Fr(~msg) ]
  --[ Sent(~msg), Secret(~msg) ]->
  [ {outs} ]

rule BobRecv:
  [ BobKey(k), In(q), In(tag) ]
  --[ Eq(verify(tag, k), measure(q, k)), Recv(measure(q, k)) ]->
  []

restriction Equality:
  "All x y #i. Eq(x, y) @ i ==> x = y"

lemma executable:
  exists-trace
  "Ex m #i #j. Sent(m) @ i & Recv(m) @ j & #i < #j"

lemma secret:
  "All m #i. Secret(m) @ i ==> not (Ex #j. K(m) @ j)"

lemma correspondence:
  "All m #i. Recv(m) @ i ==> Ex #j. Sent(m) @ j & #j < #i"

end
"""


def assemble(options):
    leak = bool(options.get("leak_key"))
    theory = theory_text(leak)
    WORK.mkdir(exist_ok=True)
    path = WORK / ("qsend_leak.spthy" if leak else "qsend.spthy")
    path.write_text(theory)
    label = "key on the channel" if leak else "key off the channel"
    return theory, path, label


def grid():
    return [{"leak_key": False}, {"leak_key": True}]
