"""Conference key agreement from a GHZ state (N-BB84 style), three parties.

Abstraction. A GHZ triplet ~g is split into three linear facts; one sifted key round is
modeled and the conference key is key(g). Bob and Charlie each announce their basis to
Alice over a MAC-authenticated channel; Alice confirms the round to both. The toggles are
about the classical layer only: one group MAC key versus one key per pair, and whether the
MAC input carries the sender and receiver identities. The network attacker can drop, hold
and relay classical messages and particles, or measure a particle and pass on a fake; the
outcome is opaque because her basis is not the sifted one, and the fake fails Alice's
test-outcome comparison (parameter estimation), which is what detects intercept-resend.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "work"

PROTOCOL = {
    "id": "cka",
    "name": "Conference key agreement (GHZ)",
    "group": "multiparty",
    "blurb": "Three-party conference key from a GHZ state with Alice as hub. Toggles: group MAC key versus pairwise keys, identity-bound MAC.",
    "story": "The quantum part gives all three parties the same raw key. Whether Alice can tell Bob's announcement from Charlie's is a property of the MAC input. A group key without identity binding lets the attacker replay one party's announcement as the other's. This is the multi-party twin of V3; countermeasure CM2 (identity-bound MAC) generalizes.",
    "fields": [
        {"key": "psk_mode", "label": "MAC keys", "kind": "choice", "default": "pairwise", "options": [
            {"id": "group", "label": "One group key"},
            {"id": "pairwise", "label": "One key per pair"},
        ]},
        {"key": "identity_bound", "label": "Identity-bound MAC (sender, receiver in the MAC input)", "kind": "bool", "default": False},
    ],
    "lemmas": [
        {"name": "executable", "kind": "exists-trace", "title": "Executability", "desc": "All three parties commit to the same conference key."},
        {"name": "key_secret", "kind": "all-traces", "title": "Key secrecy", "desc": "A key Alice commits to never enters attacker knowledge."},
        {"name": "agreement_AB", "kind": "all-traces", "title": "Agreement Alice-Bob", "desc": "When Alice commits with Bob on a key, Bob ran the protocol with Alice on that key."},
        {"name": "agreement_AC", "kind": "all-traces", "title": "Agreement Alice-Charlie", "desc": "When Alice commits with Charlie on a key, Charlie ran the protocol with Alice on that key."},
        {"name": "aliveness", "kind": "all-traces", "title": "Aliveness", "desc": "When Alice commits with a party, that party took part in some round."},
    ],
    "presets": [
        {"id": "group-plain", "label": "Group key, plain MAC", "options": {"psk_mode": "group", "identity_bound": False}, "story": "The attacker relays Bob's announcement as Charlie's. Alice commits with a Charlie who never ran. Agreement and aliveness fail; secrecy holds."},
        {"id": "group-bound", "label": "Group key, identity-bound MAC", "options": {"psk_mode": "group", "identity_bound": True}, "story": "CM2 applied to three parties: all lemmas hold."},
        {"id": "pairwise-plain", "label": "Pairwise keys, plain MAC", "options": {"psk_mode": "pairwise", "identity_bound": False}, "story": "Separate keys separate the parties: all lemmas hold."},
    ],
    "standards": [
        {"clause": "Murta, Grasselli, Kampermann, Bruss, Adv. Quantum Technol. 3, 2000025 (2020)", "text": "Review of quantum conference key agreement. The classical post-processing is specified per party but the authentication of the announcements is assumed, not designed."},
        {"clause": "Epping, Kampermann, Macchiavello, Bruss, New J. Phys. 19, 093012 (2017)", "text": "N-BB84 from GHZ states: Z-basis key rounds, X-basis test rounds, with Alice as the hub for the classical layer."},
        {"clause": "ITU-T FG QIT4N D2.3.1", "text": "MAC-based authentication of post-processing messages without requiring role, direction, or session binding in the MAC input: the plain-MAC toggle."},
        {"clause": "ETSI GS QKD 004 V2.1.1", "text": "Key delivery to applications by key ID; a conference key would be delivered to three applications under the same guarantees the control plane gave."},
    ],
    "lanes": [
        ["alice", ["Alice"]],
        ["bob", ["Bob"]],
        ["charlie", ["Charlie"]],
        ["channel", ["Source", "Chan"]],
        ["eve", ["Eve"]],
    ],
}


def theory_text(psk_mode, identity_bound):
    name = f"CKA_{psk_mode}_{'bound' if identity_bound else 'plain'}"
    if psk_mode == "group":
        keys = """
/* One group MAC key shared by all three parties. */
rule Chan_Keys:
  [ Fr(~k) ]
  --[ ]->
  [ !Key('A', 'B', ~k), !Key('B', 'A', ~k), !Key('A', 'C', ~k), !Key('C', 'A', ~k) ]
"""
    else:
        keys = """
/* One MAC key per pair (Alice-Bob, Alice-Charlie). */
rule Chan_Keys:
  [ Fr(~kab), Fr(~kac) ]
  --[ ]->
  [ !Key('A', 'B', ~kab), !Key('B', 'A', ~kab), !Key('A', 'C', ~kac), !Key('C', 'A', ~kac) ]
"""
    macin = "<x, y, m>" if identity_bound else "m"
    return f"""theory {name}
begin

/* key(g) is the Z-basis outcome shared by the three GHZ holders in a sifted
   round, test(g) the X-basis test outcome Alice compares for parameter
   estimation; meas(g, b) is the opaque outcome of a measurement in another basis. */
functions: key/1, test/1, meas/2, mac/2
{keys}
rule Source_GHZ:
  [ Fr(~g), Fr(~r) ]
  --[ ]->
  [ GHZ_A(~r, ~g), GHZ_B(~r, ~g), GHZ_C(~r, ~g), Out(~r) ]

/* MAC-authenticated channel from x to y. MAC input: {macin}. */
rule Chan_AuthOut:
  [ Out_Auth(x, y, m), !Key(x, y, k) ]
  --[ ]->
  [ Out(<x, y, m, mac({macin}, k)>) ]

rule Chan_AuthIn:
  [ In(<x, y, m, tag>), !Key(x, y, k) ]
  --[ Eq(tag, mac({macin}, k)) ]->
  [ In_Auth(x, y, m) ]

rule Alice_Measure:
  [ GHZ_A(r, g), Fr(~bA) ]
  --[ Create('A', r) ]->
  [ AliceHas(r, g, ~bA) ]

rule Bob_Measure:
  [ GHZ_B(r, g), Fr(~bB) ]
  --[ Create('B', r) ]->
  [ BobHas(r, g, ~bB) ]

rule Charlie_Measure:
  [ GHZ_C(r, g), Fr(~bC) ]
  --[ Create('C', r) ]->
  [ CharlieHas(r, g, ~bC) ]

rule Bob_Announce:
  [ BobHas(r, g, bB) ]
  --[ Running('B', 'A', key(g)) ]->
  [ Out_Auth('B', 'A', <'basis', r, bB, test(g)>), BobWait(r, g) ]

rule Charlie_Announce:
  [ CharlieHas(r, g, bC) ]
  --[ Running('C', 'A', key(g)) ]->
  [ Out_Auth('C', 'A', <'basis', r, bC, test(g)>), CharlieWait(r, g) ]

/* Alice sifts on both announcements, checks the test outcomes against her own
   particle (parameter estimation), and confirms the round to both parties. */
rule Alice_Commit:
  [ AliceHas(r, g, bA), In_Auth('B', 'A', <'basis', r, bB, test(g)>), In_Auth('C', 'A', <'basis', r, bC, test(g)>) ]
  --[ Commit('A', 'B', key(g)), Commit('A', 'C', key(g)), AliceKey(key(g)),
      Running('A', 'B', key(g)), Running('A', 'C', key(g)) ]->
  [ Out_Auth('A', 'B', <'accept', r, bA>), Out_Auth('A', 'C', <'accept', r, bA>) ]

rule Bob_Commit:
  [ BobWait(r, g), In_Auth('A', 'B', <'accept', r, bA>) ]
  --[ Commit('B', 'A', key(g)) ]->
  [ ]

rule Charlie_Commit:
  [ CharlieWait(r, g), In_Auth('A', 'C', <'accept', r, bA>) ]
  --[ Commit('C', 'A', key(g)) ]->
  [ ]

/* Network attacker on the quantum channel: hold a particle, or measure it in a
   basis of her own and pass on a fake. */
rule Eve_Intercept_B:
  [ GHZ_B(r, g), Fr(~f), Fr(~b) ]
  --[ Intercept(r, 'B') ]->
  [ Out(meas(g, ~b)), GHZ_B(r, ~f) ]

rule Eve_Intercept_C:
  [ GHZ_C(r, g), Fr(~f), Fr(~b) ]
  --[ Intercept(r, 'C') ]->
  [ Out(meas(g, ~b)), GHZ_C(r, ~f) ]

restriction InterceptOnce:
  "All r x #i #j. Intercept(r, x) @ i & Intercept(r, x) @ j ==> #i = #j"

restriction Equality:
  "All x y #i. Eq(x, y) @ i ==> x = y"

lemma executable:
  exists-trace
  "Ex k #i #j #l. Commit('A', 'B', k) @ i & Commit('B', 'A', k) @ j & Commit('C', 'A', k) @ l
     & #i < #j & #i < #l & not (Ex r x #m. Intercept(r, x) @ m)"

lemma key_secret:
  "All k #i. AliceKey(k) @ i ==> not (Ex #j. K(k) @ j)"

lemma agreement_AB:
  "All k #i. Commit('A', 'B', k) @ i ==> Ex #j. Running('B', 'A', k) @ j & #j < #i"

lemma agreement_AC:
  "All k #i. Commit('A', 'C', k) @ i ==> Ex #j. Running('C', 'A', k) @ j & #j < #i"

lemma aliveness:
  "All x k #i. Commit('A', x, k) @ i ==> Ex r #j. Create(x, r) @ j & #j < #i"

end
"""


def _label(psk_mode, identity_bound):
    return ("group key" if psk_mode == "group" else "pairwise keys") + " / " + ("identity-bound MAC" if identity_bound else "plain MAC")


def assemble(options):
    psk_mode = options.get("psk_mode", "pairwise")
    if psk_mode not in ("group", "pairwise"):
        raise ValueError("Unknown psk_mode")
    identity_bound = bool(options.get("identity_bound", False))
    theory = theory_text(psk_mode, identity_bound)
    WORK.mkdir(exist_ok=True)
    path = WORK / f"cka_{psk_mode}_{'bound' if identity_bound else 'plain'}.spthy"
    path.write_text(theory)
    return theory, path, _label(psk_mode, identity_bound)


def grid():
    return [
        {"psk_mode": "group", "identity_bound": False},
        {"psk_mode": "group", "identity_bound": True},
        {"psk_mode": "pairwise", "identity_bound": False},
        {"psk_mode": "pairwise", "identity_bound": True},
    ]
