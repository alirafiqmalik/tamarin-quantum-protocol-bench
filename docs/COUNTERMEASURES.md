# CM1 and CM2: this demo's encoding of the paper's countermeasures

The paper ("Beyond the Quantum Promise", Section V) describes two countermeasures in prose.
Its Tamarin encoding of them is not published, so the fragments here are **our encoding** and
the demo says so. Both are m4 switches on `vendor/qkd-fev/main.m4`:

| flag | default | effect |
|---|---|---|
| `CM1=true` | `false` | measurement-commitment phase (`generic_models/common/CM/cm1_{PM,EB}.spthy`) |
| `CM2=true` | `false` | identity- and role-bound MAC on the authenticated channel (`generic_models/common/CM/cm2_*.spthy`) |

With both flags `false` the generated theory is byte-identical to the pre-change library
(`tests/test_cm.py` checks the sha256 of 108 assembled theories; the EB/TWEC/PostM hash equals the
model hash recorded by the baseline batch in `evidence/index.json`). The bench exposes the flags
as the boolean options `cm1` and `cm2` of the `qkd` protocol (`bench/protocols/qkd.py`), in the
file name (`..._cm1_cm2.spthy`), in the label (`PM / Network / FEC / A2B / CM1+CM2`), in four new
presets, and in the 36-point grid (9 Table I configurations x {baseline, CM1, CM2, CM1+CM2}).

## 1. What the paper says

> **CM1: Measurement commitment phase.** [...] after measuring qubits, both participants
> transmit a MAC-protected commitment before announcing bases, eliminating the window for
> deferred measurement and timing-based relay.

> **CM2: Identity-bound MAC.** [...] MAC computations [...] include explicit sender and receiver
> identities, role metadata, and session context. Formally
> `mac_pskAB(Sender_id, Receiver_id, session_t, data)`. [...] any deviation in expected peer
> identity or session role renders the MAC invalid.

> With CM1 and CM2 together, all nine target models verify secrecy and agreement lemmas.

## 2. Exact rule changes

### 2.1 CM2: identity- and role-bound MAC

The baseline channel (`PM/Adv_Network.spthy`, identical in the other three adversary files up to
the delivery fact) is

```
rule ChanOut_Auth:  tag = mac(msg, key_roleA)
  [ !AuthSession(roleA, key_roleA), Out_Auth(roleA,roleB,msg,type) ] --> [ !Auth(roleA,msg,tag,type), Out(<roleA,roleB,msg,tag,type>) ]
rule ChanIn_Auth:   verified = verifymac(tag, key_roleB)
  [ !AuthSession(roleB,key_roleB), !Auth(roleA,msg,tag,type), In(<roleA,roleB,msg,tag,type>) ] --[ Eq(msg, verified) ]-> [ In_Auth(roleA,roleB,msg,type) ]
```

The tag binds nothing but the message, and `roleB` is whatever the network says. Under `CM2=true`
each adversary file swaps this block (via `CM2_ELSE(include(...), <original text>)`) for the
variant in `generic_models/common/CM/cm2_<family>_<adversary>.spthy`:

```
rule ChanOut_Auth:
  tag = mac(<roleA, rA, roleB, mtype, msg>, key_roleA)
  [ !AuthSession(roleA, key_roleA, rA), Out_Auth(roleA,roleB,msg,mtype) ]
  --[ AChanOut(roleA,<msg,mtype>) ]->
  [ !Auth(roleA,msg,tag,mtype), Out(<roleA,rA,roleB,msg,tag,mtype>) ]

rule ChanIn_Auth:
  verified = verifymac(tag, key_roleB)
  [ !AuthSession(roleB, key_roleB, rB), !Auth(roleA,msg,tag,mtype), In(<roleA,rA,roleB,msg,tag,mtype>) ]
  --[ Eq(<roleA, rA, roleB, mtype, msg>, verified), Neq(rA, rB), AChanIn(roleA,roleB,<msg,mtype>) ]->
  [ In_Auth(roleA,roleB,msg,mtype) ]
```

Mapping to the paper's `mac_pskAB(Sender_id, Receiver_id, session_t, data)`:

| paper | here |
|---|---|
| `Sender_id` | `roleA`, taken from the sender's own `!AuthSession` fact |
| `Receiver_id` | `roleB`, and the receiver checks it against **its own** identity in `!AuthSession(roleB, ...)` |
| role metadata | `rA`, the sender's protocol role; the receiver accepts only the complementary role (`Neq(rA, rB)`, two roles exist) |
| `session_t` | the message kind `mtype` (`'commit'`, `'sift'`, `'sample'`, `'error'`); the key `psk(~sid)` is already per session |
| `data` | `msg` |

The role is supplied by the party that owns the key: `Alice_quantum_phase` emits
`!AuthSession('A', psk(~sid), 'initiator')`, `Bob_quantum_phase` emits
`!AuthSession('B', psk(~sid), 'responder')` (both families), and in the malicious-user models Eve's
`Session_Eve_as_A/B` rules emit `'initiator'` / `'responder'` respectively. The m4 macro
`CM2_ONLY(<!,'initiator'!>)` appends that argument only when the flag is on. The equational theory
`verifymac(mac(msg, psk(id)), psk(id)) = msg` is untouched; the receiver checks the full verified
tuple against the values it holds.

Why the role is needed: in these models identities and roles coincide (`'A'` is always the Alice
role) and the paper's V3 self-sessions come from `Setup` accepting `<'A','A'>` from the network.
A tag over `<sender, receiver, kind, msg>` alone is exactly what Alice herself produced in such a
session (`sender = receiver = 'A'`), so it would still verify when reflected. The paper's "role
metadata" is what breaks the reflection: Alice's tag says `'initiator'`, and Alice only accepts
`'responder'`.

### 2.2 CM1: measurement commitment

`generic_models/common/CM/cm1_{PM,EB}.spthy` declares `functions: h/1` and adds four rules (PM
shown; EB is identical except that Alice's raw key is her measurement result):

```
rule Alice_Send_CommitA:   cA = h(KAraw)
  [ ToCommitA('A',Y,~sid,KAraw) ] --[ Send_CommitA('A',Y,cA) ]-> [ Out_Auth('A',Y,cA,'commit'), Alice_Sent_CommitA('A',Y,~sid,cA) ]
rule Alice_Receive_CommitB:
  [ Alice_Sent_CommitA('A',Y,~sid,cA), In_Auth(Y,'A',cB,'commit') ] --[ Receive_CommitB(Y,'A',cB) ]-> [ Alice_Received_CommitB('A',Y,~sid,cB) ]
rule Bob_Send_CommitB:     cB = h(KBraw)
  [ ToCommitB(X,'B',~sid,KBraw) ] --[ Send_CommitB('B',X,cB) ]-> [ Out_Auth('B',X,cB,'commit'), Bob_Sent_CommitB(X,'B',~sid,cB) ]
rule Bob_Receive_CommitA:
  [ Bob_Sent_CommitB(X,'B',~sid,cB), In_Auth(X,'B',cA,'commit') ] --[ Receive_CommitA(X,'B',cA) ]-> [ Bob_Received_CommitA(X,'B',~sid,cA) ]
```

and three hooks in the party fragments, active only under `CM1=true` (`CM1_ONLY(...)`):

* `Alice_quantum_phase` / `Bob_quantum_phase` additionally produce `ToCommitA('A',Y,~sid,KAraw)` /
  `ToCommitB(X,'B',~sid,KBraw)`: the commitment is to the raw key that was just prepared or measured.
* `Alice_Send_BA` consumes `Alice_Received_CommitB('A',Y,~sid,cB)` and `Bob_Send_BB` consumes
  `Bob_Received_CommitA(X,'B',~sid,cA)`: no basis announcement before the peer's commitment has
  arrived over the authenticated channel. This is the state-fact encoding of the ordering rather
  than a restriction, so it holds in every trace by construction.

Mapping: "after measuring qubits" = the `ToCommit` fact is created by the quantum-phase rule;
"MAC-protected commitment" = it travels as `Out_Auth(..., 'commit')` and so gets the channel's
tag (plain or, with CM2, identity-bound); "before announcing bases" = the basis rules wait for it.
Lemmas are unchanged. Executability still holds (measured below), so the commit step does not
deadlock the A2B ordering restriction.

## 3. Measured results

PM / Network / FEC / A2B (`SeqA`) and EB / Network / FEC / unordered (`PostM`). Tamarin 1.12.0,
heuristic `S`, `+RTS -N4`, `--derivcheck-timeout=180`, 600 s limit per lemma. Seconds are Tamarin's
own processing time on a 16-core machine while a 6-core batch and a second 4-core worker were
running, so they are 2-3x the idle figures in the plan (the plan's 16.7 s for the baseline
`secret_key_A` became 39.9 s here). Every verdict is a real prover output; the files are
`work/qkd_PM_Network_FEC_SeqA_true_true_true[_cm1][_cm2].spthy` and the EB equivalents.

### 3.1 PM / Network / FEC / A2B

| lemma | baseline | CM1 | CM2 | CM1+CM2 | paper (Table I / Section V-B) |
|---|---|---|---|---|---|
| executability_success | verified, 21 steps, 47.0 s | verified, 26, 81.3 s | verified, 21, 60.5 s | verified, 26, 154.2 s | verified |
| secret_key_A | **falsified**, 15, 39.9 s (a) | **falsified**, 18, 63.8 s (b) | **falsified**, 15, 61.6 s (c) | **verified**, 44, 94.2 s | falsified V2 / verified / falsified V2 / verified |
| aliveness_A | **falsified**, 9, 52.6 s (d) | **falsified**, 12, 34.3 s (d) | verified, 5, 48.7 s | verified, 5, 56.0 s | falsified V3 / falsified V3 / verified / verified |
| weak_agreement_A | **falsified**, 9, 46.4 s (d) | **falsified**, 12, 35.3 s (d) | **falsified**, 13, 43.1 s (e) | **falsified**, 18, 59.3 s (e) | falsified V3 / falsified V3 / verified / verified |
| noninjectiveagreement_A | **falsified**, 9, 55.7 s (d) | **falsified**, 12, 36.3 s (d) | **falsified**, 13, 43.7 s (e) | **falsified**, 18, 71.4 s (e) | falsified V3 / falsified V3 / verified / verified |

### 3.2 EB / Network / FEC / unordered

| lemma | baseline | CM1+CM2 | paper |
|---|---|---|---|
| executability_success | verified (baseline batch) | verified, 12 steps, 348.0 s | verified |
| secret_key_A | **falsified**, 10 steps, 148.9 s (f) | **verified**, 94 steps, 289.0 s (188.1 s in the grid run) | falsified V1 / verified |

### 3.3 What the counterexamples are (read from the JSON traces)

* (a) `Setup` consumes `<'A','A'>`: Alice runs a session with a peer named `'A'`; there is no Bob.
  Eve holds Alice's qubit, waits for `Send_BA`, measures it in `BA(~ba)` (`QChan_Adv_Measure`),
  and reflects Alice's own sift, sample, and error messages back to her (`checkError(x,x)=true`).
  Alice commits to a key Eve can compute. This is the V2 "basis-deferred measurement" step, but
  Tamarin's shortest witness obtains the basis-first ordering through a V3 self-session, not
  through a Bob that is served a re-prepared qubit.
* (b) The same trace with one more reflected message: Alice's own `h(KAraw)` commitment comes back
  as "Bob's" commitment and unlocks `Alice_Send_BA`. CM1 adds the step; without role binding the
  step can be reflected like every other message.
* (c) The textbook V2 with Bob present: `Setup <'A','B'>`, Alice announces, Eve measures in
  `BA(~ba)`, re-prepares with `QChan_Create_State`, Bob measures the copy, parameter estimation
  passes, Eve derives the key. The self-session is blocked by CM2, the timing window is not.
* (d) `Setup <'A','A'>` self-session (V3): `CommitKey_A('A','A',...)` with no `Create_B` /
  `Running_B` anywhere.
* (e) An honest `<'A','B'>` run with no adversary step at all ((e) under CM1+CM2 uses only
  `QChan_Out`/`QChan_In_Forward`). Bob has sent his sample but has not yet executed `Bob_FEC`
  when Alice executes `Alice_FEC`. In the FEC fragment `CommitKey_A` and `Running_A` are raised by
  the rule that *sends* the correction, and `Running_B` only by the rule that *receives* it, so
  Alice always commits before Bob can be "running". The lemma is unsatisfiable for FEC (and
  symmetrically `*_B` for REC) in any trace, countermeasures or not.
* (f) V1 as in the paper: `Setup <'A','B'>`, Alice gets her genuine half and announces `BA(~ba)`
  before Bob has a qubit; Eve measures *Bob's* half in `BA(~ba)` (`QChan_Adv_Measure_B`),
  re-encodes it, Bob measures the copy, and the equational theory makes parameter estimation pass.

### 3.4 Full grid (9 configurations x 4 countermeasure sets x 9 lemmas)

Measured 28 October 2026 with `python3 -m bench.batch --protocol qkd --timeout 900 --heuristic S`,
`TAMARIN_CORES=8`, two batches (PM and EB) in parallel. 324 records, no timeouts, no empty
results; the longest lemma took 481 s. The records are in `evidence/qkd/` and the matrix in
Station C marks every cell that differs from the paper (`≠paper`).

| countermeasures | executability | secret_key_* | aliveness_* | weak_agreement_* | noninjectiveagreement_* |
|---|---|---|---|---|---|
| baseline | 9/9 verified | 4/18 verified | 10/18 | 6/18 | 6/18 |
| CM1 | 9/9 | 14/18 | 10/18 | 6/18 | 6/18 |
| CM2 | 9/9 | 6/18 | **18/18** | 6/18 | 6/18 |
| CM1+CM2 | 9/9 | **18/18** | **18/18** | 6/18 | 6/18 |

What the 62 cells that differ from the expectations are (trace classes read from the JSON traces
with the script in the plan; "honest" means no `QChan_Adv_*` rule and no self-session):

* **CM1 alone, secret_key_A (4 cells, PM x {FEC, TWEC} x {A2B, B2A})**: falsified, self-session
  with the reflected commitment, trace (b). The paper expects CM1 to close V2. It never does on
  its own in this encoding.
* **CM2 alone, secret_key_A for B2A FEC and B2A TWEC (2 cells)**: verified (40 and 136 steps).
  The paper attributes these cells to V2 and expects CM1 to be needed. The B2A witnesses need the
  reflection to obtain Alice's basis before Bob's, so CM2 is enough there. The A2B cells stay
  falsified by trace (c), the Bob-present V2.
* **Agreement under CM1+CM2 (24 of 36 cells)**: falsified with an honest `<'A','B'>` trace, no
  adversary rule at all, trace (e). The pattern is exact: the party that sends the correction
  fails both agreement lemmas (A under FEC, B under REC, both under TWEC); the receiving party
  verifies (12 cells). Table I attributes exactly these cells to V3. The cause is where the
  reconciliation fragments raise `CommitKey`/`Running`, not an attack, and no countermeasure
  can change it while the lemmas stay as published.
* **Agreement under CM2 alone (24 cells)**: 16 are the same honest trace (e); the 8 A2B cells
  (PM x {FEC, TWEC, REC} x A2B, sender side) contain `QChan_Adv_Measure`, a basis-deferred
  measurement with Bob present, so there CM1 would be needed for the attack step even though the
  lemma would still fail for the placement reason.
* **Baseline and CM1, EB weak_agreement (4 cells each)**: EB/TWEC A and B, EB/REC B, EB/FEC A are
  falsified with the honest trace (e); the transcription of Table I in `bench/protocols/qkd.py`
  has them verified. These are the sender-side cells of the pattern above, and Table I marks the
  matching `noninjectiveagreement_*` cells as V3, so the most likely reading is that the paper's
  weak-agreement column was summarised differently; the records stand as measured.

## 4. Discrepancies with the stated expectations

1. **CM1 alone does not restore `secret_key_A` here** (expected: verified). The V3 self-session
   reflects the commitment as well, trace (b). This is consistent with the paper's own mechanics:
   it attributes the B2A FEC/TWEC secrecy failures to V2 although those rows need the self-session
   to get Alice's basis out before Bob's. The paper's claim that CM1 "closes the V1/V2 windows on
   every previously failing row" is only reproduced with CM2 present (3.1, last column, and 3.2).
2. **`weak_agreement_A` and `noninjectiveagreement_A` stay falsified under CM1+CM2** for FEC
   (expected: verified), trace (e). This is a property of where the library places
   `CommitKey`/`Running` in `common/ER/FEC.spthy`, not of either countermeasure, and it does not
   depend on any adversary action. The paper's Table I marks these cells as V3 failures and claims
   every agreement lemma verifies with the combined fix; with the lemmas kept unchanged (as
   required) that cannot hold for the sender side of a one-way reconciliation. `aliveness_A`, which
   only needs `Create_B`, does verify with CM2.
3. `secret_key_A` under CM2 alone is falsified as expected, but by trace (c), the Bob-present V2
   witness, whereas the baseline witness (a) never involves Bob.

4. **CM2 alone restores `secret_key_A` for B2A FEC and B2A TWEC** (expected: falsified V2), see
   3.4. Under CM1+CM2 every secrecy cell verifies (18/18), including all three EB configurations.

Everything that the expectations attribute to V3 flips with CM2 (aliveness, 18/18), everything
attributed to V1/V2 flips with CM1 and CM2 together (secrecy, 18/18), and the agreement lemmas on
the correction-sending side never flip because of lemma placement (3.4).

## 5. Known limits

* Encoding is ours. The paper's `session_t` is read as the message kind plus the per-session key;
  we do not add `~sid` to the tag because `psk(~sid)` already fixes the session.
* Role binding uses `Neq(rA, rB)`, which is equivalent to "the complementary role" only because
  there are exactly two roles. A three-party extension needs an explicit expected-role field.
* The commitment is `h(raw key)` and is never opened; its only job in the model is ordering.
  The commitment value is not used by any later rule, so a fresh nonce would give the same proofs.
* Only the PM/FEC/A2B and EB/FEC/PostM points were measured one lemma at a time. The remaining
  grid points come from the batch over `registry.grid("qkd")` (36 points); the `expectations`
  list in `bench/protocols/qkd.py` marks CM rows as `source: "prose"` because the paper gives no
  per-countermeasure table.
* MaliciousUser models assemble and pass wellformedness with both flags, but were not proved.
* Tamarin 1.12's derivation check aborts under `--quit-on-warning` when it exceeds its budget on a
  loaded machine; the baseline models trigger this too. The bench now passes
  `--derivcheck-timeout=0`; the measurements above used `180`.
* Timings were taken under CPU contention; use them for ordering, not as benchmarks.

## 6. Reproduce

```
TAMARIN_CORES=4 python3 -c "
from bench import registry; from bench.prove import prove_file
o = registry.normalize('qkd', {'type':'PM','adv':'Network','er':'FEC','bo':'SeqA','exec':True,'secrecy':True,'auth':True,'cm1':True,'cm2':True})
_, path, label = registry.assemble('qkd', o)
r = prove_file(path, heuristic='S', timeout=600, lemma='secret_key_A')
print(label, [(l['name'], l['status'], l['steps']) for l in r['lemmas'] if l['status'] != 'not run'], r['seconds'])"
```

Tests: `python3 -m unittest tests.test_cm tests.test_bench`.
