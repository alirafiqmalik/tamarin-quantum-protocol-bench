# Quantum simulator (WP1)

Two implementations of the same sampling experiments:

- `web/src/sim/` (TypeScript, no dependencies, no React): the browser simulator behind the
  "Simulation versus Formal verification" view. Deterministic for a seed, incremental
  (`step(n)` per animation frame), state-vector physics for 1 to 6 qubits.
- `sim/` (Python, numpy only): an independent cross-check for BB84 and EB QKD that uses the
  closed-form measurement statistics of the same states instead of a state vector. It exists
  so the numbers in the paper can be reproduced from the command line.

The point the numbers make: intercept-resend is caught by sampling (QBER about 25 %), while the
symbolic vulnerabilities V1 (entanglement injection) and V2 (basis-deferred measurement) give
QBER about 0 with the attacker holding every sifted bit, and V3 (message reflection) never
touches the quantum channel. Sampling cannot see them; Tamarin reasons over every trace.

## Contract

`web/src/sim/types.ts` is the contract with the views; `web/src/sim/index.ts` exports
`sim: SimApi` (`protocols` metadata and `create(params)`), the per-protocol factories, and
`normalizeParams` for partial parameters. `Experiment.step(n)` returns a `Batch` with the running
`Counters`, the `Trial`s completed during the step (one trial per `roundsPerTrial` rounds, for the
histogram), up to 8 sampled `Path`s (polylines in 0..1 coordinates, 6 to 12 points, for the
"space of executions" picture) and a `note` saying what the attacker did under this schedule.

Counters added to the contract (optional fields): `testRounds`, `testErrors` and `bellDetected`.
`detected` is strictly the QBER check (`qber > threshold`); `bellDetected` is the Bell / parity
test (EB QKD: CHSH `S < 2` after 64 test rounds; CKA: X-basis parity failure rate above the
threshold). They are separate so the UI can show that only a Bell test, never QBER, notices an
injected product state.

The physics RNG and the path RNG are separate streams seeded from `params.seed`, so the
counters after N rounds do not depend on how the view chunks `step()`.

## Physics

`qstate.ts`: complex state vector, little-endian qubit index. Gates H, X, Y, Z, S, S†, phase,
Ry(θ), CNOT, CZ. Projective measurement in Z, X, Y or any Bloch angle θ in the X-Z plane
(basis states `Ry(θ)|0>`, `Ry(θ)|1>`; θ = 0 is Z, θ = π/2 is X), implemented as rotate-in,
Z-measure, rotate-out, so the state collapses onto the measured basis state and a "resend" is
just the collapsed state. Depolarizing noise `ρ → (1-p)ρ + p·I/2` is sampled as one Pauli with
probability p/4 each. Fidelity of one qubit with a pure reference goes through the reduced
density matrix, so it is correct after the other qubits have been measured.

Noise conventions: BB84 applies the channel to the single flying qubit, giving sifted QBER
`p/2`. EB QKD applies it to both halves (two links), giving QBER about `p` and CHSH `S` scaled
by `(1-p)²`. Teleportation and superdense coding apply it to the distributed halves and to the
flying qubit; the GHZ protocols to all three qubits. Attackers sit at the sender's end: the
state they forward crosses the same noisy channel, which is why a V2 run with noise looks
exactly like an honest run with the same noise.

## Protocols and strategies

| Protocol | Strategy | Maps to | Schedule switch | Result (noise 0) |
|---|---|---|---|---|
| bb84 | none | – | – | QBER 0 |
| bb84 | intercept-resend | – | – | QBER 0.25, Eve knows 0.5 |
| bb84 | v2-deferred | V2 | `basisOrder='A2B'`, `commitment` not true | QBER 0, Eve knows 1 |
| bb84 | v2-deferred | V2 | `basisOrder='B2A'` or `commitment=true` | degrades to intercept-resend (note says why) |
| bb84 | v3-reflection | V3 | `identityBound` false | honest statistics, Eve "knows" 1 (session with itself) |
| bb84 | v3-reflection | V3 | `identityBound=true` | honest; note "MAC binds identities; reflection rejected" |
| ebqkd | none | – | – | QBER 0, S ≈ 2.8 |
| ebqkd | intercept-resend | – | – | QBER 0.25, S ≈ 1.41 |
| ebqkd | v1-injection | V1 | `commitment` not false | QBER 0, Eve knows 1, S ≈ 1.41 (`bellDetected`) |
| ebqkd | v1-injection | V1 | `commitment=false` | QBER 0, Eve knows 1, S ≈ 2.8 (nothing detects it) |
| teleport | none | – | – | fidelity 1 |
| teleport | tamper-classical | V3 | `authenticated=false` | fidelity ≈ 0.50, 75 % of rounds wrong |
| teleport | tamper-classical | V3 | `authenticated` true | rejected, fidelity 1 |
| teleport | untrusted-source | V1 | – | fidelity 1, Eve held the state (eveKnows 1) |
| superdense | none | – | – | 0 errors |
| superdense | intercept-resend | – | – | 50 % of messages wrong (25 % bit error), Eve learns nothing |
| superdense | untrusted-source | V1 | – | 0 errors, Eve knows 1 |
| qss | none | – | – | 0 errors on the valid half of the rounds |
| qss | intercept-resend | – | – | 25 % errors, Eve knows 0 |
| qss | dishonest-party | V2 | `dealerOrder='first'` (default) | 0 errors, insider knows 1 |
| qss | dishonest-party | V2 | `dealerOrder='last'` | 25 % errors, insider knows 0.5 |
| cka | none | – | – | 0 key errors, 0 parity failures |
| cka | intercept-resend | – | – | QBER 0.25, 25 % parity failures (`bellDetected`) |
| cka | dishonest-party | V3 | `identityBound` false | honest statistics, eveKnows 1 (relay) |
| cka | dishonest-party | V3 | `identityBound=true` | honest; "MAC binds identities; relay rejected" |

A strategy that does not apply to a protocol runs honestly with a note saying so.

### BB84 (`bb84.ts`)

Alice picks a bit and a basis (Z or X), prepares; channel; Bob picks a basis, measures. Sifting
keeps matching bases; errors are counted on sifted rounds. `eveKnows` counts sifted rounds whose
value Eve knows with certainty: for intercept-resend that is the half of the rounds where her
basis guess matched (her other guesses agree with Alice half the time but she cannot tell).

V2 needs quantum memory and Alice's basis announcement before Bob has to have measured
(`A2B`, no CM1 commitment). Under `B2A` Bob must measure before Alice says anything and under CM1
Bob commits to his outcome before any basis is announced, so the qubit has to be delivered
first; Eve must guess, which is intercept-resend. V3 is classical only: the quantum rounds are
simulated honestly and every sifted bit is counted as compromised, because the key Alice believes
she shares with Bob was agreed with the reflected copy of herself (the failing lemma is agreement
/ aliveness, not secrecy of a bit Eve read). With `authenticated=false` the reflection also
works (there is no MAC at all); the note says which case applies.

### Entanglement-based QKD (`ebqkd.ts`)

BBM92 on `|Φ+>` with CHSH test rounds (one round in four). Key rounds: random Z/X on both
sides, sifted when they match. Test rounds: Alice uses Bloch angles {0, π/2}, Bob {π/4, −π/4};
`S = E(a0,b0) + E(a0,b1) + E(a1,b0) − E(a1,b1)`, which is `2√2 ≈ 2.83` for `|Φ+>` (and
`E(a,b) = cos(a−b)`, checked in `qstate.test.ts`). `S` is reported once every setting pair has a
sample.

V1: Eve owns the source. She keeps one qubit of each pair and sends the other to Bob; Bob
measures and announces his basis; Eve measures her qubit in that basis and prepares a fresh
qubit for Alice in the same basis with Bob's outcome. The time shift is modelled by the schedule:
Bob's announcement happens before Alice's qubit arrives. Sifted key rounds are perfectly
correlated (QBER 0) and Eve knows every bit. The CHSH settings are a different matter:

- by default the test settings are only revealed after both parties have measured
  (`commitment` undefined or true). Eve cannot know Bob's setting when she prepares Alice's test
  qubit and can only send a product state; she measures in Z and forwards the eigenstate. Any
  such local strategy has `S ≤ 2`; this one gives `S = cos(π/4)·2 ≈ 1.41`. `bellDetected` becomes
  true, `detected` (QBER) stays false: only a Bell test, not QBER, notices.
- with `commitment=false` every setting, including the test settings, is announced before Alice
  measures. Eve prepares in Bob's actual setting, reproduces `E(a,b) = cos(a−b)` on every pair
  of settings, and passes the CHSH test with `S ≈ 2.83`. This is the documented variant in which
  nothing in the sampled statistics can tell the run from an honest one.

Intercept-resend measures Bob's qubit in a random Z/X basis and forwards the collapsed state:
QBER 25 % and `S = 2.83/2 ≈ 1.41`.

### Teleportation (`teleport.ts`)

A Haar-random qubit is teleported through `|Φ+>` (q0 input, q1 Alice's half, q2 Bob's half).
Alice does CNOT, H and measures both; Bob applies `X^m2` then `Z^m1`. `counters.fidelity` is the
mean fidelity of Bob's qubit with the input; a round is an "error" when that fidelity is below 1
(in practice this is only visible through test rounds or tomography; the simulator just knows).

`tamper-classical`: with `authenticated=false` Eve substitutes random correction bits. With
probability 1/4 they happen to be right (fidelity 1); otherwise Bob applies a wrong Pauli and the
Haar-averaged fidelity is 1/3, so the mean is 0.5. (Deterministically flipping both bits would
give a mean of 1/3; random substitution is the general tamper and the value the demo quotes.)
With an authenticated channel the substituted message is rejected and Bob uses the authentic
bits.

`untrusted-source`: the two-party twin of V1. Eve shares the pair with Alice and keeps the other
half herself; Alice's correction bits are authenticated but readable, so Eve applies them and now
holds the input state. She then delivers to Bob, late, the qubit `X^m2 Z^m1 |ψ>` so that his own
correction yields `|ψ>`: fidelity 1, nothing for sampling to see. `eveKnows = 1` here means what
the symbolic model means: the attacker derived the state term. No-cloning still holds: she cannot
keep a copy without measuring, and measuring would cost fidelity. The late delivery is the same
timing freedom V1 exploits; without it (and with authentication) her own re-teleportation
would need Bob to apply her correction bits instead of Alice's.

### Superdense coding (`superdense.ts`)

Alice encodes two bits with `X^b2 Z^b1` on her half of `|Φ+>` and sends it; Bob does CNOT, H and
measures both: `(b1, b2)`. A round is an error when the decoded message is wrong (either bit).
Intercept-resend: Eve measures the flying qubit alone; its reduced state is `I/2` for every
message, so her outcome is independent of the bits (eveKnows 0). Her collapse destroys exactly
one of the two bits (Z measurement leaves `b2` intact, X measurement leaves `b1` intact), so Bob
decodes 50 % of messages wrongly (bit error rate 25 %). `untrusted-source`: Eve holds the partner
of Alice's qubit (pair 1), decodes exactly, and re-encodes the bits on her half of pair 2 whose
other half Bob received from "the source". No errors; message known. No time shift is needed
here.

### GHZ protocols (`ghz.ts`)

`qss` (HBB99): dealer (q0), Bob (q1), Charlie (q2) each measure `(|000>+|111>)/√2` in X or Y.
Rounds with an even number of Y bases are valid (half of them); there `b ⊕ c ⊕ [two Y bases]`
equals the dealer's bit, so the two parties recover it only together (checked in
`qstate.test.ts`). `dishonest-party`: Charlie intercepts Bob's qubit and hands Bob a dummy.

- `dealerOrder='first'` (also the default): Charlie learns the dealer's basis before measuring,
  measures both qubits in bases that make the round valid and consistent, and knows every secret
  bit alone. He speaks last in the check phase, so he can answer consistently with Bob's dummy
  outcome: no errors. He keeps the round valid with probability 1/2 so that the validity rate
  matches an honest run.
- `dealerOrder='last'`: he must commit to measurement bases before he knows hers. He measures
  X, X and announces X. When the dealer used X he is right; when she used Y her bit is
  uncorrelated with his, so 25 % of valid rounds are wrong and he knows half the bits.

Simplification: the parties' basis announcements are treated as independent of each other
(simultaneous, or the dealer checks that the announced basis pairs are uniformly distributed).
If the insider may choose his announced basis after seeing Bob's, he can make rounds valid only
when the dealer's basis matches his guess; this also defeats dealer-last and is visible only in
the basis statistics (the dealer's X rounds would never be valid), not in the error rate.

`cka`: key rounds (3 in 4) measure Z, all three bits equal; test rounds measure X and check even
parity (`testRounds`, `testErrors`, `bellDetected`). Intercept-resend on Bob's qubit in a random
Z/X basis gives QBER 25 % and 25 % parity failures. `dishonest-party` is the multi-party V3:
with one group MAC key and no identity binding, Charlie relays Alice's announcements to Bob as
his own; the quantum statistics are honest and every key bit is counted as compromised because
Bob agrees the key with the wrong partner. With `identityBound=true` the relay is rejected.

## Python cross-check

`sim/bb84.py` and `sim/ebqkd.py` implement the same strategies with vectorized numpy using
closed-form statistics: a BB84 state measured in its own basis returns its bit and otherwise a
uniform bit; two measurements on `|Φ+>` at angles a, b agree with probability `cos²((a−b)/2)`;
an eigenstate of angle e measured at angle a returns its bit with probability `cos²((a−e)/2)`;
depolarizing with p scales a correlation by `(1−p)`, i.e. flips the outcome with probability
p/2. Because it does not share any code with the state-vector implementation, agreement
between the two is a real cross-check (EB intercept-resend: both converge to `S ≈ 1.41`).

```
python3 -m sim --protocol bb84 --strategy v2-deferred --rounds 4096 --trials 20 --json
python3 -m sim --protocol ebqkd --strategy v1-injection --no-commitment --rounds 4096 --trials 20
python3 -m sim --protocol bb84 --strategy v2-deferred --basis-order B2A
```

Schedule flags: `--basis-order A2B|B2A|none`, `--commitment` / `--no-commitment`,
`--unauthenticated`, `--identity-bound`; plus `--noise`, `--threshold`, `--seed`. The JSON
summary has `qber_mean`, `qber_std`, `eve_knows_mean`, `detection_rate` (fraction of trials
with QBER above the threshold) and, for EB QKD, `chsh_mean`, `chsh_std`, `bell_detection_rate`.

## Tests

```
cd web && npx tsc -p tsconfig.app.json --noEmit   # types
cd web && npm test                                 # vitest: qstate.test.ts, sim.test.ts
python3 -m unittest tests.test_sim                 # numpy cross-check and CLI
```

`qstate.test.ts` checks the physics (measurement statistics, Bell and GHZ correlations,
`E(a,b) = cos(a−b)`, fidelity). `sim.test.ts` checks the headline numbers per protocol and
strategy, determinism (same seed, any chunking, after `reset()`), the path and trial shapes, and
that `step(500)` stays under 16 ms for BB84 and EB QKD (measured 0.5 to 2.6 ms in Node).
