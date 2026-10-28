# Protocols beyond QKD (WP6)

Four protocol families generated from Python templates in `bench/protocols/`: quantum
teleportation (`teleport.py`), superdense coding (`superdense.py`), quantum secret sharing
(`qss.py`), and GHZ conference key agreement (`cka.py`). Each module exposes `PROTOCOL`
(catalog entry: fields, lemmas, presets, standards, lanes), `assemble(options)` which writes
`work/<id>_<options>.spthy`, and `grid()` which lists every option combination for the batch.
The theories are 48 to 125 lines each and every lemma finishes in under 21 s.

Evidence below: Tamarin 1.12.0, heuristic S, `+RTS -N4`, one `--prove=<lemma>` run per
lemma, measured on 27 October 2026 while a 36-point QKD batch ran on the same machine.
"Seconds" is Tamarin's reported processing time. Every counterexample row carries a
JSON trace that `bench/trace.py` renders as a sequence chart.

## Shared modeling conventions

The style follows the QKD-FEV models (`vendor/qkd-fev/generic_models/PM/primitives.spthy`,
`Adv_Network.spthy`):

- Quantum states are terms. A pair or GHZ triplet is a fresh name; the halves or particles
  are terms over it (`half(e)`, `halfA(e)`, `GHZ_B(r, g)`).
- Measurement is a function with equations: `recover(half(e), bm(psi, e)) = psi`,
  `decodeSD(encodeSD(halfA(e), m), halfB(e)) = m`, `recover(shareB(s), shareC(s)) = s`.
  A measurement with the wrong half or in an unrelated basis yields an irreducible term,
  which stands for an uncorrelated outcome.
- No-cloning is approximated with linear facts. A quantum state is never placed in `Out()`.
  It moves through linear facts (`PairB`, `Quantum`, `GHZ_B`) that exactly one rule can
  consume, so a particle that is measured or held is gone for everybody else.
- Attacker quantum capabilities are explicit rules with lane prefix `Eve_`: provide the
  pair (`Eve_Source`), measure a state in flight (`Eve_Measure`, `Eve_Intercept_*`),
  prepare a state (`Eve_Inject`). Classical messages go through the standard Dolev-Yao
  network. Authenticated channels are either abstract (`!Auth` facts, QSS) or MAC-based
  with explicit keys (CKA, teleportation, superdense confirmation).
- Rule names start with the lane prefix (`Alice_`, `Bob_`, `Charlie_`, `Dealer_`,
  `Source_`, `Chan_`, `Eve_`) so `bench/trace.py` can place every event.
- Bases are fresh names, never public constants, so the symbolic attacker cannot "guess"
  a basis with probability 1/2 and have Tamarin report the lucky guess as an attack.

## 1. Quantum teleportation (`teleport`)

Bennett, Brassard, Crepeau, Jozsa, Peres, Wootters (1993). Parties Alice, Bob, Source.

Abstraction. `Source_Pair` creates `~e` with a public heralding label `~sid`, giving the
linear facts `PairA(sid, e)` and `PairB(sid, e)`. Alice's Bell measurement on her secret
state `~psi` and her half is the classical term `bm(~psi, e)`; `Alice_Teleport` sends
`<sid, bits>`. `Bob_Recover` applies `recover(half(e), bits)` to whatever bits arrive and
records `Recovered('B', ...)` without any check, because a real Bob cannot tell a wrong
correction from a right one. The label `sid` is restricted to one pair (`UniquePair`), which
models a heralded source; without it Bob could pair bits from one round with a half from
another and integrity would fail even in the honest configuration.

Options.
- `auth`: Alice adds `mac(<'A', 'B', sid, bits>, k)` with a preshared key `!PSK(k)`
  (`Chan_PSK`); Bob checks it with `verify`.
- `trusted_source`: honest `Source_Pair` with `Fr(~e)`, versus `Eve_Source: [In(<sid, e>)]`
  where the attacker chooses and therefore knows `e`.

Lemmas. `executable` (Bob recovers what Alice teleported); `state_secret`
(`Teleported('A', psi) ==> not K(psi)`); `state_integrity`
(`Recovered('B', psi) ==> Teleported('A', psi)` earlier).

**MAC on / trusted source** (`teleport_auth_trusted.spthy`, 53 lines; options `auth=True, trusted_source=True`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 9 | 0.62 |
| state_secret | verified | 6 | 0.43 |
| state_integrity | verified | 10 | 0.48 |

**no MAC / trusted source** (`teleport_plain_trusted.spthy`, 48 lines; options `auth=False, trusted_source=True`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 6 | 0.27 |
| state_secret | verified | 4 | 0.24 |
| state_integrity | **falsified** (trace) | 5 | 0.22 |

Trace: the attacker replaces `<sid, bm(~psi, ~e)>` by `<sid, bits>` of her choice; Bob
records `Recovered('B', recover(half(~e), bits))`, a state nobody teleported.

**MAC on / attacker source** (`teleport_auth_evesource.spthy`, 53 lines; options `auth=True, trusted_source=False`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 8 | 0.46 |
| state_secret | **falsified** (trace) | 6 | 0.42 |
| state_integrity | verified | 10 | 0.42 |

Trace: the attacker supplies `e`, reads `bm(~psi, e)` from the public channel and computes
`recover(half(e), bm(~psi, e)) = ~psi`. The MAC does not help: the bits are authentic.

**no MAC / attacker source** (`teleport_plain_evesource.spthy`, 48 lines; options `auth=False, trusted_source=False`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 5 | 0.23 |
| state_secret | **falsified** (trace) | 5 | 0.2 |
| state_integrity | **falsified** (trace) | 4 | 0.2 |

All four points match the expected verdicts.

## 2. Superdense coding (`superdense`)

Bennett and Wiesner (1992). Parties Alice, Bob, Source.

Abstraction. The pair `~e` has halves `halfA(e)` and `halfB(e)` in linear facts. Alice
encodes two fresh bits `~m` as `encodeSD(hA, ~m)` and puts the qubit on the quantum channel
(`QOut`). The channel is a linear fact `Quantum(sid, q)`: `Chan_QOut` places it, `Chan_QIn`
delivers it to Bob, `Eve_Measure: [Quantum(sid, q), In(hb)] --> [Out(decodeSD(q, hb))]`
consumes it (Bob then receives nothing unless the attacker injects), and
`Eve_Inject: [In(<sid, x>)] --> [QIn(sid, x)]` puts a state the attacker prepared in front
of Bob. Injected states go straight to Bob's input rather than through `Quantum` because
measuring one's own prepared state teaches nothing; routing them through `Quantum` made the
attacker's inject-then-measure pair an identity oracle that looped the backward search
(three of four points timed out before the change; none after it). Bob decodes
`decodeSD(q, hB)` and records `Decoded(...)` without a check.

Options.
- `trusted_source`: as for teleportation (`Eve_Source` knows `e` and can build `halfB(e)`).
- `confirm`: Alice also sends `mac(<'A', 'B', sid, h(~m)>, k)`; Bob checks
  `h(decodeSD(q, hB))` against it before recording `Decoded`.

Lemmas. `executable` (without attacker interference); `message_secret`
(`Sent(m) ==> not K(m)`); `message_integrity` (`Decoded(m) ==> Sent(m)` earlier).

Decision on garbage decoding. Without the confirmation MAC, Bob records whatever
`decodeSD(x, halfB(e))` gives for an injected `x`. In the physical protocol Bob's Bell
measurement always produces two bits; a substituted qubit gives him bits Alice never sent,
and he cannot notice. We therefore count `Decoded` of an irreducible term as an integrity
violation; the quantum channel is a data channel with no authentication of its own.

**trusted source / no confirmation** (`superdense_trusted_plain.spthy`, 67 lines; options `trusted_source=True, confirm=False`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 5 | 0.39 |
| message_secret | verified | 4 | 0.33 |
| message_integrity | **falsified** (trace) | 6 | 0.33 |

Trace: `Eve_Inject` puts an attacker term in front of Bob, who records
`Decoded(decodeSD(x, halfB(~e)))`. Alice's own qubit is still on the channel.

**trusted source / confirmation MAC** (`superdense_trusted_confirm.spthy`, 74 lines; options `trusted_source=True, confirm=True`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 8 | 0.56 |
| message_secret | verified | 5 | 0.51 |
| message_integrity | verified | 11 | 0.63 |

**attacker source / no confirmation** (`superdense_evesource_plain.spthy`, 68 lines; options `trusted_source=False, confirm=False`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 5 | 0.34 |
| message_secret | **falsified** (trace) | 5 | 0.4 |
| message_integrity | **falsified** (trace) | 7 | 0.31 |

Traces: secrecy, the attacker builds `halfB(e)` and `Eve_Measure` yields `~m`; integrity,
the attacker builds `encodeSD(halfA(e), m')` for a message of her own and injects it, so
Bob records `Decoded(m')`, a meaningful substitution rather than garbage.

**attacker source / confirmation MAC** (`superdense_evesource_confirm.spthy`, 75 lines; options `trusted_source=False, confirm=True`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 8 | 0.5 |
| message_secret | **falsified** (trace) | 6 | 0.43 |
| message_integrity | verified | 11 | 0.56 |

All four points match the expected verdicts, with the trusted/no-confirmation integrity
verdict decided as above.

## 3. Quantum secret sharing (`qss`)

Hillery, Buzek, Berthiaume (1999), GHZ triplet; dealer Alice, parties Bob and Charlie.

Abstraction. `Source_GHZ` emits `GHZ_A/B/C(r, g)` with a public round label `r`. The
model is one round that survives sifting: the dealer's outcome is `s = secret(g)`, the
parties' outcomes are the shares `shareB(s)`, `shareC(s)`, and
`recover(shareB(s), shareC(s)) = s` (subterm-convergent; the earlier form
`recover(shareB(g), shareC(g)) = secret(g)` is rejected by `--quit-on-warning`). Each party
chooses a fresh basis and announces `<'basis', r, b>` over an authenticated channel
(`Chan_AuthOut` / `Chan_AuthIn` via `!Auth`, no confidentiality). After the round is
sifted, `Bob_Reveal` sends `<'share', r, shareB(s)>` to Charlie (`BobShared`), and
`Charlie_Recover` records `CharlieRecovers(r, recover(b, c))`. The network attacker may
take a particle in flight, measure it in a basis of her own and pass on a fake
(`Eve_Intercept_B/C`, opaque outcome `meas(g, ~b)`); `InterceptOnce` bounds this per
round and particle because intercepting the replacement again yields nothing and let the
search loop (all four points timed out in precomputation without it).

Options.
- `dealer_order`: `first` (restriction `Announce(r,'A')` before every other
  `Announce(r, x)`) or `last` (after every other).
- `dishonest`: `none`, or `charlie`, which adds `Charlie_Intercept` (takes `GHZ_B`, hands
  Bob a fake `GHZ_B(r, ~f)`) and `Charlie_Adapt`, the "measure Bob's particle in the
  matching basis" rule. It requires `In_Auth('A', <'basis', r, bA>)` and emits Charlie's
  own `Announce(r, 'C')`. This is the HBB99 argument folded into one rule: the attack goes
  undetected only if Charlie can pick his announced basis after seeing the dealer's, so
  that he keeps the rounds where Bob's fake outcome is predictable and discards the
  others. `AnnounceOnce` makes a second announcement impossible, so with the dealer last
  Charlie cannot both announce before the dealer and adapt after her.

Lemmas. `executable` (honest reconstruction; the Eve and Charlie intercept rules are
excluded from the witness); `outsider_secret` (`DealerSecret(r, s) ==> not K(s)`);
`insider_alone` (`CharlieRecovers(r, secret(g)) ==> BobShared(r, shareB(secret(g)))`
earlier: Charlie learns the secret only with Bob's genuine share).

**dealer last / honest parties** (`qss_last_none.spthy`, 110 lines; options `dealer_order=last, dishonest=none`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 8 | 0.68 |
| outsider_secret | verified | 35 | 1.12 |
| insider_alone | verified | 5 | 0.64 |

**dealer first / honest parties** (`qss_first_none.spthy`, 110 lines; options `dealer_order=first, dishonest=none`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 8 | 0.81 |
| outsider_secret | verified | 35 | 1.1 |
| insider_alone | verified | 5 | 0.63 |

**dealer last / dishonest Charlie** (`qss_last_charlie.spthy`, 125 lines; options `dealer_order=last, dishonest=charlie`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 8 | 0.85 |
| outsider_secret | verified | 61 | 1.84 |
| insider_alone | verified | 10 | 0.91 |

**dealer first / dishonest Charlie** (`qss_first_charlie.spthy`, 125 lines; options `dealer_order=first, dishonest=charlie`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 8 | 0.75 |
| outsider_secret | verified | 62 | 1.34 |
| insider_alone | **falsified** (trace) | 6 | 0.81 |

Trace (lanes dealer, charlie, channel): `Charlie_Measure`, `Charlie_Intercept`,
`Dealer_Measure`, `Dealer_Announce`, `Charlie_Adapt`, `Charlie_Recover(secret(~g))`, with
no `BobShared`. All four points match the expected verdicts.

## 4. Conference key agreement (`cka`)

GHZ-based N-BB84 (Epping et al. 2017; Murta et al. 2020 review). Alice is the hub; Bob
and Charlie each have a MAC-authenticated channel to Alice.

Abstraction. `Source_GHZ` emits the three particles with round label `r`; the conference
key is `key(g)`, the X-basis test outcome is `test(g)`. Each party measures (`Create`).
Bob and Charlie announce `<'basis', r, b, test(g)>` to Alice (`Running(x, 'A', key(g))`).
`Alice_Commit` needs both announcements for her `r` with `test(g)` matching her own
particle (parameter estimation), then records `Commit('A', 'B', key(g))`,
`Commit('A', 'C', key(g))`, `AliceKey(key(g))` and confirms `<'accept', r, bA>` to each;
`Bob_Commit` / `Charlie_Commit` record their commits. MAC channel: `Chan_AuthOut` sends
`<x, y, m, mac(MSG, k)>` for `!Key(x, y, k)` and `Chan_AuthIn` checks it for the claimed
sender-receiver pair. The attacker can hold or drop particles and `Eve_Intercept_B/C`
measure-and-replace with an opaque outcome; the fake fails the `test(g)` comparison, which
is the one-round rendering of detection by test rounds.

Options.
- `psk_mode`: `group` (one key in all four `!Key` entries) or `pairwise` (`~kab`, `~kac`).
- `identity_bound`: MAC input `<x, y, m>` versus `m`.

Lemmas. `executable` (all three commit to the same key, no interception);
`key_secret` (`AliceKey(k) ==> not K(k)`); `agreement_AB`, `agreement_AC`
(`Commit('A', x, k) ==> Running(x, 'A', k)` earlier, non-injective agreement on the key);
`aliveness` (`Commit('A', x, k) ==> Create(x, r)` earlier for some round).

**group key / plain MAC** (`cka_group_plain.spthy`, 109 lines; options `psk_mode=group, identity_bound=False`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 20 | 20.82 |
| key_secret | verified | 14 | 1.28 |
| agreement_AB | **falsified** (trace) | 13 | 3.43 |
| agreement_AC | **falsified** (trace) | 11 | 3.05 |
| aliveness | **falsified** (trace) | 11 | 4.08 |

Trace for `agreement_AC`: Bob sends `<'B', 'A', <'basis', ~r, ~bB, test(~g)>, mac(..., ~k)>`;
the attacker re-sends the same body and tag as `<'C', 'A', ...>`; both `Chan_AuthIn`
checks pass under the group key; Alice commits with Charlie, who never ran. `aliveness`
fails for the same reason (no `Create('C', _)` in the trace at all). `agreement_AB` is the
mirror image with Charlie's announcement.

**group key / identity-bound MAC** (`cka_group_bound.spthy`, 109 lines; options `psk_mode=group, identity_bound=True`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 21 | 8.23 |
| key_secret | verified | 14 | 1.49 |
| agreement_AB | verified | 16 | 1.33 |
| agreement_AC | verified | 26 | 1.83 |
| aliveness | verified | 34 | 2.3 |

**pairwise keys / plain MAC** (`cka_pairwise_plain.spthy`, 109 lines; options `psk_mode=pairwise, identity_bound=False`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 21 | 8.64 |
| key_secret | verified | 14 | 1.46 |
| agreement_AB | verified | 16 | 1.36 |
| agreement_AC | verified | 26 | 1.79 |
| aliveness | verified | 34 | 3.19 |

**pairwise keys / identity-bound MAC** (`cka_pairwise_bound.spthy`, 109 lines; options `psk_mode=pairwise, identity_bound=True`)

| Lemma | Verdict | Steps | Seconds |
|---|---|---|---|
| executable | verified | 21 | 8.58 |
| key_secret | verified | 14 | 1.45 |
| agreement_AB | verified | 16 | 1.76 |
| agreement_AC | verified | 26 | 2.35 |
| aliveness | verified | 34 | 2.9 |

All four points match the expected verdicts. Note on the first measurement: before the
`test(g)` comparison was added, the three countermeasure configurations also falsified
`agreement_AB/AC` through a different trace, `Eve_Intercept_C` followed by Charlie
announcing for the fake `key(~f)`. That is intercept-resend, which the real protocol
detects statistically in test rounds; the one-round model needed an explicit stand-in for
that detection, exactly as QKD-FEV's `checkError` equation provides for QKD. With it, the
only remaining attack is the classical relay.

## Limits of the symbolic abstraction

- No-cloning is only approximated. Linear facts stop two rules from consuming the same
  particle, but a term such as `encodeSD(halfA(e), m)` has a classical description, and an
  attacker who knows `e` (untrusted source) can build it. That is deliberate (she holds the
  real counterparts), but it means "the attacker knows the state" and "the attacker holds
  the state" coincide in those configurations.
- Probabilistic outcomes are not modeled. A measurement in the sifted basis gives the
  correlated outcome; any other basis gives an opaque term. There is no 50 % lucky guess,
  no QBER, and detection is all-or-nothing (`test(g)` in CKA, the adaptive-announcement
  rule in QSS). The QSS rule `Charlie_Adapt` compresses HBB99's detection argument into a
  precondition; the model does not derive it.
- One round per theory. Sifting over many rounds, parameter estimation statistics, error
  correction and privacy amplification are outside the models. The round label `r` and the
  `UniquePair` / `InterceptOnce` / `AnnounceOnce` restrictions are what make the one-round
  abstraction well defined and keep the search finite.
- No noise, no loss. Honest runs always succeed; aborts exist only as the absence of a
  commit. Teleportation fidelity, decoding error, and GHZ visibility are the simulator's
  business, not Tamarin's.
- The attacker's quantum capability is exactly the listed `Eve_` rules. Entangling
  attacks, delayed joint measurements on several particles, and side channels are not in
  the model; the one deferred-measurement strategy that matters for the classical layer
  (an insider holding two particles until the dealer speaks) is modeled explicitly.
- Authenticated channels in QSS are abstract (`!Auth`), so replay on them is possible but
  harmless there; in CKA they are concrete MACs, which is where the identity-binding
  result comes from.

## Files

- `bench/protocols/teleport.py`, `bench/protocols/superdense.py`,
  `bench/protocols/qss.py`, `bench/protocols/cka.py`: modules.
- `tests/test_protocols.py`: catalog and grid checks, wellformedness of every grid point
  (`tamarin-prover --quit-on-warning`), and the decisive verdicts (two points per protocol,
  `prove_file`, heuristic S, 120 s).
- `work/<id>_*.spthy`: generated theories (git-ignored).
