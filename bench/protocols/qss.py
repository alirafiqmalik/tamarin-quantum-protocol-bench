"""Quantum secret sharing (Hillery, Buzek, Berthiaume 1999): GHZ triplet, dealer plus two parties.

Abstraction. A GHZ triplet is a fresh name ~g split into three linear facts GHZ_A/B/C
(one holder per particle). The model covers one round that survives sifting: the dealer's
outcome is s = secret(g), Bob's and Charlie's outcomes are the shares shareB(s) and
shareC(s), and recover(shareB(s), shareC(s)) = s. Bases are fresh, unguessable values that
are announced over authenticated channels; the announcement order is the toggle. A dishonest
Charlie may take Bob's particle and hand Bob a fake. The undetected version of the HBB99
attack needs Charlie to choose his announced basis after learning the dealer's basis, so
his "measure Bob's particle in the matching basis" rule both consumes the dealer's
announcement and emits Charlie's announcement.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "work"

PROTOCOL = {
    "id": "qss",
    "name": "Quantum secret sharing (HBB99)",
    "group": "multiparty",
    "blurb": "GHZ-based secret sharing with a dealer and two parties. Toggles: dealer announces her basis first or last, dishonest Charlie present.",
    "story": "Both parties must cooperate to reconstruct the dealer's secret. A dishonest party who intercepts the other party's particle can reconstruct alone, but only if the dealer's basis announcement comes before his own. The announcement order, a classical choice, decides. This is the multi-party twin of V2.",
    "fields": [
        {"key": "dealer_order", "label": "Dealer's basis announcement", "kind": "choice", "default": "last", "options": [
            {"id": "first", "label": "Dealer announces first"},
            {"id": "last", "label": "Dealer announces last"},
        ]},
        {"key": "dishonest", "label": "Dishonest party", "kind": "choice", "default": "none", "options": [
            {"id": "none", "label": "None (network attacker only)"},
            {"id": "charlie", "label": "Charlie intercepts Bob's particle"},
        ]},
    ],
    "lemmas": [
        {"name": "executable", "kind": "exists-trace", "title": "Executability", "desc": "Bob and Charlie together reconstruct the dealer's secret."},
        {"name": "outsider_secret", "kind": "all-traces", "title": "Outsider secrecy", "desc": "The dealer's secret never enters network-attacker knowledge."},
        {"name": "insider_alone", "kind": "all-traces", "title": "No single insider", "desc": "Charlie reconstructs the secret only after Bob revealed his genuine share."},
    ],
    "presets": [
        {"id": "honest-last", "label": "Dealer last, honest parties", "options": {"dealer_order": "last", "dishonest": "none"}, "story": "All lemmas hold."},
        {"id": "charlie-first", "label": "Dealer first, dishonest Charlie", "options": {"dealer_order": "first", "dishonest": "charlie"}, "story": "Charlie holds both particles, learns the dealer's basis, measures Bob's particle to match and reconstructs alone. No single insider fails."},
        {"id": "charlie-last", "label": "Dealer last, dishonest Charlie", "options": {"dealer_order": "last", "dishonest": "charlie"}, "story": "Charlie must commit to his basis before the dealer speaks. All lemmas hold."},
    ],
    "standards": [
        {"clause": "Hillery, Buzek, Berthiaume, Phys. Rev. A 59, 1829 (1999)", "text": "Quantum secret sharing with GHZ states. Section IV discusses the dishonest-party attack and notes that the order in which bases are announced decides whether it is detected."},
        {"clause": "Karlsson, Koashi, Imoto, Phys. Rev. A 59, 162 (1999)", "text": "Secret sharing with two-particle entanglement; the same announcement-order argument applies."},
        {"clause": "ETSI GS QKD 014 V1.1.1 (context)", "text": "Key delivery assumes an authenticated classical channel but does not fix the order of classical announcements; multi-party protocols inherit the gap."},
    ],
    "lanes": [
        ["dealer", ["Dealer"]],
        ["bob", ["Bob"]],
        ["charlie", ["Charlie"]],
        ["channel", ["Source", "Chan"]],
        ["eve", ["Eve"]],
    ],
}


def theory_text(dealer_order, dishonest):
    name = f"QSS_{dealer_order}_{dishonest}"
    if dealer_order == "first":
        order = """
/* Dealer announces her basis before either party. */
restriction DealerFirst:
  "All r x #i #j. Announce(r, 'A') @ i & Announce(r, x) @ j & not (x = 'A') ==> #i < #j"
"""
    else:
        order = """
/* Dealer announces her basis only after both parties. */
restriction DealerLast:
  "All r x #i #j. Announce(r, 'A') @ i & Announce(r, x) @ j & not (x = 'A') ==> #j < #i"
"""
    charlie_bad = ""
    exec_extra = ""
    if dishonest == "charlie":
        charlie_bad = """
/* Dishonest Charlie: takes Bob's particle, hands Bob a fake, and measures Bob's
   particle in the basis that matches the dealer's announcement. Because the
   undetected attack needs his own announcement to depend on the dealer's basis,
   this rule is also his announcement. */
rule Charlie_Intercept:
  [ GHZ_B(r, g), Fr(~f) ]
  --[ CharlieIntercept(r), Intercept(r, 'B') ]->
  [ CHoldsB(r, g), GHZ_B(r, ~f) ]

rule Charlie_Adapt:
  [ CHoldsB(r, g), In_Auth('A', <'basis', r, bA>), Fr(~bC) ]
  --[ Announce(r, 'C'), CharlieAdapt(r) ]->
  [ CHasB(r, shareB(secret(g))), Out_Auth('C', <'basis', r, ~bC>) ]
"""
        exec_extra = "\n     & not (Ex r2 #l. CharlieIntercept(r2) @ l)"
    return f"""theory {name}
begin

/* One sifted round: the dealer's outcome is s = secret(g), the parties'
   outcomes are the shares shareB(s), shareC(s), and the shares combine to s.
   meas(g, b) is the opaque outcome of measuring in an unrelated basis b. */
functions: secret/1, shareB/1, shareC/1, recover/2, meas/2
equations:
  recover(shareB(s), shareC(s)) = s

rule Source_GHZ:
  [ Fr(~g), Fr(~r) ]
  --[ ]->
  [ GHZ_A(~r, ~g), GHZ_B(~r, ~g), GHZ_C(~r, ~g), Out(~r) ]

/* Authenticated classical channel (no confidentiality). */
rule Chan_AuthOut:
  [ Out_Auth(a, m) ]
  --[ ]->
  [ !Auth(a, m), Out(m) ]

rule Chan_AuthIn:
  [ !Auth(a, m) ]
  --[ ]->
  [ In_Auth(a, m) ]

rule Dealer_Measure:
  [ GHZ_A(r, g), Fr(~bA) ]
  --[ DealerSecret(r, secret(g)) ]->
  [ DealerHas(r, g, ~bA) ]

rule Dealer_Announce:
  [ DealerHas(r, g, bA) ]
  --[ Announce(r, 'A') ]->
  [ Out_Auth('A', <'basis', r, bA>) ]

rule Bob_Measure:
  [ GHZ_B(r, g), Fr(~bB) ]
  --[ ]->
  [ BobHas(r, g, ~bB) ]

rule Bob_Announce:
  [ BobHas(r, g, bB) ]
  --[ Announce(r, 'B') ]->
  [ Out_Auth('B', <'basis', r, bB>), BobAnnounced(r, g) ]

/* Reconstruction: once the round is sifted Bob gives Charlie his share. */
rule Bob_Reveal:
  [ BobAnnounced(r, g), In_Auth('A', <'basis', r, bA>), In_Auth('C', <'basis', r, bC>) ]
  --[ BobShared(r, shareB(secret(g))) ]->
  [ Out_Auth('B', <'share', r, shareB(secret(g))>) ]

rule Charlie_Measure:
  [ GHZ_C(r, g), Fr(~bC) ]
  --[ ]->
  [ CharlieHas(r, g, ~bC), CShare(r, shareC(secret(g))) ]

rule Charlie_Announce:
  [ CharlieHas(r, g, bC) ]
  --[ Announce(r, 'C') ]->
  [ Out_Auth('C', <'basis', r, bC>) ]

rule Charlie_Receive:
  [ In_Auth('B', <'share', r, s>) ]
  --[ ]->
  [ CHasB(r, s) ]

rule Charlie_Recover:
  [ CShare(r, c), CHasB(r, b) ]
  --[ CharlieRecovers(r, recover(b, c)) ]->
  [ ]
{charlie_bad}
/* Network attacker: may take a particle in flight, measure it in a basis of her
   own, and pass on a fake. The outcome is opaque: her basis is not the sifted one. */
rule Eve_Intercept_B:
  [ GHZ_B(r, g), Fr(~f), Fr(~b) ]
  --[ EveIntercept(r), Intercept(r, 'B') ]->
  [ Out(meas(g, ~b)), GHZ_B(r, ~f) ]

rule Eve_Intercept_C:
  [ GHZ_C(r, g), Fr(~f), Fr(~b) ]
  --[ EveIntercept(r), Intercept(r, 'C') ]->
  [ Out(meas(g, ~b)), GHZ_C(r, ~f) ]

/* A particle is intercepted at most once per round: intercepting the
   replacement again yields nothing and would let the search loop. */
restriction InterceptOnce:
  "All r x #i #j. Intercept(r, x) @ i & Intercept(r, x) @ j ==> #i = #j"

restriction AnnounceOnce:
  "All r x #i #j. Announce(r, x) @ i & Announce(r, x) @ j ==> #i = #j"
{order}
lemma executable:
  exists-trace
  "Ex r g #i #j #k. DealerSecret(r, secret(g)) @ i & BobShared(r, shareB(secret(g))) @ j
     & CharlieRecovers(r, secret(g)) @ k & #i < #j & #j < #k
     & not (Ex r2 #l. EveIntercept(r2) @ l){exec_extra}"

lemma outsider_secret:
  "All r s #i. DealerSecret(r, s) @ i ==> not (Ex #j. K(s) @ j)"

lemma insider_alone:
  "All r g #i. CharlieRecovers(r, secret(g)) @ i
     ==> Ex #j. BobShared(r, shareB(secret(g))) @ j & #j < #i"

end
"""


def _label(dealer_order, dishonest):
    return f"dealer {dealer_order} / " + ("dishonest Charlie" if dishonest == "charlie" else "honest parties")


def assemble(options):
    dealer_order = options.get("dealer_order", "last")
    dishonest = options.get("dishonest", "none")
    if dealer_order not in ("first", "last") or dishonest not in ("none", "charlie"):
        raise ValueError("Unknown qss option")
    theory = theory_text(dealer_order, dishonest)
    WORK.mkdir(exist_ok=True)
    path = WORK / f"qss_{dealer_order}_{dishonest}.spthy"
    path.write_text(theory)
    return theory, path, _label(dealer_order, dishonest)


def grid():
    return [
        {"dealer_order": "last", "dishonest": "none"},
        {"dealer_order": "first", "dishonest": "none"},
        {"dealer_order": "last", "dishonest": "charlie"},
        {"dealer_order": "first", "dishonest": "charlie"},
    ]
