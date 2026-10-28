"""ETSI GS QKD 014-shaped key delivery and one key use after QKD."""
from itertools import product
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "work"

LEMMAS = [
    {"name": "executable", "kind": "exists-trace", "title": "Executability", "desc": "Both SAEs obtain the same key and B decrypts A's message."},
    {"name": "key_secret", "kind": "all-traces", "title": "Key secrecy", "desc": "A QKD key held by an honest SAE never enters attacker knowledge."},
    {"name": "delivered_to_authorized", "kind": "all-traces", "title": "Slave authorization", "desc": "KME_B delivers a key only to the SAE the master's Get key request named."},
    {"name": "single_delivery", "kind": "all-traces", "title": "Single delivery", "desc": "KME_B delivers each key ID at most once."},
    {"name": "message_secret", "kind": "all-traces", "title": "Message secrecy", "desc": "A message encrypted under a delivered key stays secret."},
    {"name": "message_integrity", "kind": "all-traces", "title": "Message integrity", "desc": "B accepts m under key k only if A sent m under k."},
]

STRONG = {"sae_channel": "tls", "authorize_slave": True, "keyid_transport": "authenticated", "consume": True, "reuse_guard": True}

PROTOCOL = {
    "id": "keyuse",
    "name": "Key delivery and use (ETSI 014)",
    "group": "keyuse",
    "blurb": "A QKD key leaves the KME pair through an ETSI GS QKD 014-shaped Get key API, the key ID crosses the application channel, and the key pads one message.",
    "story": "QKD is finished: both KMEs hold the same key. What the standard still has to get right is classical: a mutually authenticated SAE-KME channel, removal of delivered keys, slave authorization, key ID transport, and no key reuse. Each switch removes one of these and a lemma falls.",
    "fields": [
        {"key": "sae_channel", "label": "SAE to KME channel", "kind": "choice", "default": "tls", "options": [
            {"id": "tls", "label": "Mutually authenticated (TLS, per-SAE key)"},
            {"id": "plain", "label": "Plain network"},
        ]},
        {"key": "authorize_slave", "label": "KME_B checks the slave SAE named by the master", "kind": "bool", "default": True},
        {"key": "keyid_transport", "label": "Key ID transport SAE_A to SAE_B", "kind": "choice", "default": "authenticated", "options": [
            {"id": "authenticated", "label": "MAC under an application preshared key"},
            {"id": "public", "label": "Public channel"},
        ]},
        {"key": "consume", "label": "KME_B removes a delivered key from the pool", "kind": "bool", "default": True},
        {"key": "reuse_guard", "label": "SAE_A uses each delivered key once", "kind": "bool", "default": True},
    ],
    "lemmas": LEMMAS,
    "presets": [
        {"id": "standard-compliant", "label": "Standard compliant", "options": dict(STRONG), "story": "TLS to the KMEs, authorized slave, consumed pool entry, MAC'd key ID, one use per key: every lemma holds."},
        {"id": "bearer-token", "label": "Bearer-token key ID", "options": {**STRONG, "authorize_slave": False, "keyid_transport": "public"}, "story": "Any registered SAE that learns the key ID gets the key: a third application E fetches it from KME_B."},
        {"id": "two-time-pad", "label": "Two-time pad", "options": {**STRONG, "reuse_guard": False}, "story": "The key pads two messages; both plaintexts leak."},
        {"id": "plain-sae-channel", "label": "Plain SAE channel", "options": {**STRONG, "sae_channel": "plain"}, "story": "The key travels from the KME to the application in the clear."},
    ],
    "standards": [
        {"clause": "ETSI GS QKD 014 V1.1.1 clause 5 (Get key, Get key with key IDs)", "text": "The master SAE obtains key and key_ID from its KME and the slave SAE fetches the same key by key_ID from its own KME; the SAE-to-SAE key_ID transport is out of scope."},
        {"clause": "ETSI GS QKD 014 V1.1.1 clauses 4 and 6 (TLS, key removal, slave authorization)", "text": "SAE-KME connections are mutually authenticated TLS, a delivered key is removed from the KME so it is never delivered twice, and the slave KME serves a key_ID only to the slave SAE named in the master's request."},
        {"clause": "ETSI GS QKD 004 V2.1.1 (application interface)", "text": "The earlier open/get/close key interface delivers key material to applications by stream and index with the same removal expectation."},
        {"clause": "ETSI GS QKD 020 (interoperable KME-KME interface)", "text": "Notes that SAE identity handling across KMEs, including duplicate or unregistered SAE IDs, is a hazard the key-delivery layer has to close."},
    ],
    "lanes": [
        ["alice", ["SaeA_"]],
        ["bob", ["SaeB_"]],
        ["kme_a", ["KmeA_"]],
        ["kme_b", ["KmeB_"]],
        ["eve", ["Eve_"]],
        ["channel", ["Source_", "Chan_"]],
    ],
}


def _chan(tls, src, dst, msg, direction):
    """One SAE-KME message: a secure-channel fact under TLS, a public tuple otherwise."""
    if tls:
        return f"Sec({src}, {dst}, {msg})"
    return f"{direction}(<{src}, {dst}, {msg}>)"


def theory_text(options):
    tls = options["sae_channel"] == "tls"
    authz = options["authorize_slave"]
    mac_id = options["keyid_transport"] == "authenticated"
    consume = options["consume"]
    guard = options["reuse_guard"]
    name = "KeyUse_" + "_".join(["tls" if tls else "plain", "authz" if authz else "bearer", "macid" if mac_id else "pubid", "consume" if consume else "persist", "once" if guard else "reuse"])
    pool_b = "KMEPool" if consume else "!KMEPoolB"
    a_key = "SaeAKey" if guard else "!SaeAKey"
    req_a_out = _chan(tls, "'SAE_A'", "'KME_A'", "<'getkey', 'SAE_B'>", "Out")
    req_a_in = _chan(tls, "master", "'KME_A'", "<'getkey', slave>", "In")
    del_a_out = _chan(tls, "'KME_A'", "master", "<kid, k>", "Out")
    del_a_in = _chan(tls, "'KME_A'", "'SAE_A'", "<kid, k>", "In")
    req_b_out = _chan(tls, "'SAE_B'", "'KME_B'", "<'getkeyid', kid>", "Out")
    req_b_in = _chan(tls, "slave", "'KME_B'", "<'getkeyid', kid>", "In")
    del_b_out = _chan(tls, "'KME_B'", "slave", "<kid, k>", "Out")
    del_b_in = _chan(tls, "'KME_B'", "'SAE_B'", "<kid, k>", "In")
    kid_out = "Out(<kid, mac(kid, psk)>)" if mac_id else "Out(kid)"
    kid_in = "!AppPsk(psk), In(<kid, mac(kid, psk)>)" if mac_id else "In(kid)"
    psk_prem = "!AppPsk(psk), " if mac_id else ""
    authz_prem = ", !Authz(kid, slave)" if authz else ""
    chan_rules = """
/* TLS between SAEs and KMEs: Sec(src, dst, msg) is confidential and names
   both ends. E is a third registered application whose TLS credential the
   attacker holds, so it can open its own sessions with both KMEs. */
rule Chan_EveToKme:
  [ In(<kme, msg>) ]
  --[ EveSends(kme, msg) ]->
  [ Sec('E', kme, msg) ]

rule Chan_KmeToEve:
  [ Sec(kme, 'E', msg) ]
  --[ EveReads(kme, msg) ]->
  [ Out(msg) ]
""" if tls else """
/* Plain SAE-KME channel: every message is a public tuple <src, dst, msg>. */
"""
    return f"""theory {name}
begin

/* otp/unpad: one-time pad; mac: tag over the plaintext. */
functions: otp/2, unpad/2, mac/2
equations: unpad(otp(m, k), k) = m

/* Applications SAE_A (master) and SAE_B (slave) share an application PSK. */
rule Source_SAEs:
  [ Fr(~psk) ]
  --[ ]->
  [ !AppPsk(~psk), SaeAInit() ]

/* QKD is out of scope: both KMEs already hold key ~k under id ~kid. */
rule Source_QKD:
  [ Fr(~kid), Fr(~k) ]
  --[ QkdKey(~kid, ~k) ]->
  [ KMEPool('KME_A', ~kid, ~k), {pool_b}('KME_B', ~kid, ~k) ]
{chan_rules}
/* ETSI 014 Get key: the master names the slave SAE. */
rule SaeA_GetKey:
  [ SaeAInit() ]
  --[ MasterRequest('SAE_A', 'SAE_B') ]->
  [ SaeAWait('SAE_B'), {req_a_out} ]

rule KmeA_Deliver:
  [ {req_a_in}, KMEPool('KME_A', kid, k) ]
  --[ MasterNamed(master, kid, slave), DeliveredA(kid, k, master) ]->
  [ !Authz(kid, slave), {del_a_out} ]

rule SaeA_KeyIn:
  [ SaeAWait(slave), {psk_prem}{del_a_in} ]
  --[ KeyHeld('SAE_A', kid, k), Named(kid, slave) ]->
  [ {a_key}(kid, k), {kid_out} ]

/* ETSI 014 Get key with key IDs at the slave KME. */
rule SaeB_GetKeyWithId:
  [ {kid_in} ]
  --[ SlaveRequest('SAE_B', kid) ]->
  [ SaeBWait(kid), {req_b_out} ]

rule KmeB_Deliver:
  [ {req_b_in}, {pool_b}('KME_B', kid, k){authz_prem} ]
  --[ DeliveredB(kid, k, slave) ]->
  [ {del_b_out} ]

rule SaeB_KeyIn:
  [ SaeBWait(kid), {del_b_in} ]
  --[ KeyHeld('SAE_B', kid, k) ]->
  [ SaeBKey(kid, k) ]

/* Key use: one-time pad plus MAC. */
rule SaeA_Send:
  [ {a_key}(kid, k), Fr(~m) ]
  --[ Sent(~m, kid, k) ]->
  [ Out(<kid, otp(~m, k), mac(~m, k)>), !Pad(otp(~m, k)) ]

rule SaeB_Recv:
  [ SaeBKey(kid, k), In(<kid, otp(m, k), mac(m, k)>) ]
  --[ Received(m, kid, k) ]->
  [ ]

/* Two-time-pad leakage: two different pads seen under one key reveal both
   plaintexts (an over-approximation of m1 xor m2). !Pad records a
   ciphertext the attacker has observed on the public channel. */
rule Eve_TwoTimePad:
  [ !Pad(otp(~m1, k)), !Pad(otp(~m2, k)) ]
  --[ Neq(~m1, ~m2), Leak(~m1), Leak(~m2) ]->
  [ Out(~m1), Out(~m2) ]

restriction Inequality:
  "All x #i. Neq(x, x) @ i ==> F"

lemma executable:
  exists-trace
  "Ex kid k m #i #j #l #n.
     KeyHeld('SAE_A', kid, k) @ i & KeyHeld('SAE_B', kid, k) @ j
   & Sent(m, kid, k) @ l & Received(m, kid, k) @ n & #l < #n"

lemma key_secret:
  "All sae kid k #i #j. KeyHeld(sae, kid, k) @ i & QkdKey(kid, k) @ j
     ==> not (Ex #l. K(k) @ l)"

lemma delivered_to_authorized:
  "All kid k sae #i. DeliveredB(kid, k, sae) @ i
     ==> Ex master #j. MasterNamed(master, kid, sae) @ j & #j < #i"

lemma single_delivery:
  "All kid k s1 s2 #i #j. DeliveredB(kid, k, s1) @ i & DeliveredB(kid, k, s2) @ j ==> #i = #j"

lemma message_secret:
  "All m kid k #i. Sent(m, kid, k) @ i ==> not (Ex #j. K(m) @ j)"

lemma message_integrity:
  "All m kid k #i. Received(m, kid, k) @ i ==> Ex #j. Sent(m, kid, k) @ j & #j < #i"

end
"""


def _flag(value):
    return "true" if value else "false"


def file_name(options):
    parts = [options["sae_channel"], _flag(options["authorize_slave"]), options["keyid_transport"], _flag(options["consume"]), _flag(options["reuse_guard"])]
    return "keyuse_" + "_".join(parts) + ".spthy"


def label(options):
    bits = [
        "TLS" if options["sae_channel"] == "tls" else "plain",
        "authorized slave" if options["authorize_slave"] else "bearer key ID",
        "MAC'd key ID" if options["keyid_transport"] == "authenticated" else "public key ID",
        "consume" if options["consume"] else "persistent pool",
        "single use" if options["reuse_guard"] else "key reuse",
    ]
    return " / ".join(bits)


def assemble(options):
    theory = theory_text(options)
    WORK.mkdir(exist_ok=True)
    path = WORK / file_name(options)
    path.write_text(theory)
    return theory, path, label(options)


def grid():
    """All 32 option combinations."""
    points = []
    for chan, authz, transport, consume, guard in product(("tls", "plain"), (True, False), ("authenticated", "public"), (True, False), (True, False)):
        points.append({"sae_channel": chan, "authorize_slave": authz, "keyid_transport": transport, "consume": consume, "reuse_guard": guard})
    return points
