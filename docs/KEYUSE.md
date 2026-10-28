# WP4: key delivery and key use after QKD (`keyuse`)

Protocol module: `bench/protocols/keyuse.py` (id `keyuse`, group `keyuse`).
Tests: `tests/test_keyuse.py`. Assembled theories land in `work/keyuse_*.spthy`.

## What the model covers

QKD is finished. One pair of key management entities, KME_A and KME_B,
already share a key `~k` under identifier `~kid` (`Source_QKD`). The model
follows the shape of ETSI GS QKD 014 V1.1.1 for handing that key to
applications (secure application entities, SAEs) and then uses it once.

1. `SaeA_GetKey`: the master SAE_A calls *Get key* at KME_A and names the
   slave SAE_B.
2. `KmeA_Deliver`: KME_A takes one entry from its pool, returns `<kid, k>`
   to the requesting SAE, and records `!Authz(kid, slave)` for the KME pair
   (the KME-KME synchronisation is out of scope of 014 and is abstracted as
   shared state).
3. `SaeA_KeyIn`: SAE_A stores the key and sends `kid` to SAE_B over the
   application channel.
4. `SaeB_GetKeyWithId`: SAE_B calls *Get key with key IDs* at KME_B.
5. `KmeB_Deliver`: KME_B looks `kid` up in its pool and returns `<kid, k>`.
6. `SaeA_Send` / `SaeB_Recv`: SAE_A pads one message, `otp(m, k)`, and
   tags it with `mac(m, k)`; SAE_B unpads and checks the tag.

A third application `E` is registered at both KMEs and its TLS credential
is held by the attacker (`Chan_EveToKme`, `Chan_KmeToEve`). This is the
multi-tenant situation 014 is written for: several SAEs behind one KME.

Rule prefixes map to sequence-chart lanes: `SaeA_` alice, `SaeB_` bob,
`KmeA_` kme_a, `KmeB_` kme_b, `Eve_` eve, `Source_`/`Chan_` channel.

## Options and the clauses they switch

| Option | Strong value | Weak value | ETSI text it stands for |
|---|---|---|---|
| `sae_channel` | `tls`: SAE-KME messages are `Sec(src, dst, msg)` facts, confidential and bound to both endpoint identities | `plain`: `Out`/`In` of `<src, dst, msg>` | GS QKD 014 clause 4: SAE-KME connections are mutually authenticated TLS |
| `authorize_slave` | KME_B requires `!Authz(kid, slave)` from the master's request | any SAE presenting `kid` is served (bearer token) | GS QKD 014 clause 5/6: *Get key with key IDs* serves only the slave SAE named by the master |
| `keyid_transport` | `kid` travels with `mac(kid, psk)` under an application PSK | `kid` travels bare | GS QKD 014: SAE-to-SAE key_ID transport is out of scope; the model shows what that leaves open |
| `consume` | KME_B's pool entry is linear (`KMEPool`): one delivery | persistent (`!KMEPoolB`): delivered again on request | GS QKD 014 / GS QKD 004: a delivered key is removed from the pool |
| `reuse_guard` | SAE_A's key fact is linear: one message per key | persistent: any number of messages | one-time-pad discipline (key material is used once) |

KME_A's pool entry is always linear: the master-side *Get key* picks fresh
material, so the "remove from pool" question only arises on the slave side
where the key is addressed by ID.

## Lemmas

| Lemma | Kind | Statement |
|---|---|---|
| `executable` | exists-trace | both SAEs hold the same `(kid, k)` and SAE_B receives the message SAE_A sent |
| `key_secret` | all-traces | a QKD key held by an honest SAE (`KeyHeld` with `QkdKey`) never enters attacker knowledge |
| `delivered_to_authorized` | all-traces | if KME_B delivers `kid` to SAE X, some master's request served by KME_A named X |
| `single_delivery` | all-traces | KME_B delivers a given `(kid, k)` at most once |
| `message_secret` | all-traces | a message SAE_A sent under a delivered key stays secret |
| `message_integrity` | all-traces | SAE_B accepts `m` under `(kid, k)` only if SAE_A sent `m` under `(kid, k)` |

## Measured verdicts (all 32 grid points)

Tamarin 1.12.0, heuristic S, `+RTS -N4`, timeout 120 s, run while a six-core
QKD batch shared the machine. V = verified, F = falsified (trace found),
steps in parentheses, last column is Tamarin's processing time.

| # | channel | authorize | key ID | consume | reuse guard | exec | key_secret | authorized | single | msg_secret | msg_integrity | s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | tls | yes | MAC | yes | yes | V (18) | V (15) | V (4) | V (10) | V (5) | V (16) | 2.42 |
| 1 | tls | yes | MAC | yes | no | V (18) | V (15) | V (4) | V (10) | F (5) | V (16) | 2.96 |
| 2 | tls | yes | MAC | no | yes | V (21) | V (15) | V (4) | F (11) | V (5) | V (16) | 2.92 |
| 3 | tls | yes | MAC | no | no | V (21) | V (15) | V (4) | F (11) | F (5) | V (16) | 3.35 |
| 4 | tls | yes | public | yes | yes | V (15) | F (9) | V (4) | V (10) | V (5) | F (9) | 1.7 |
| 5 | tls | yes | public | yes | no | V (15) | F (9) | V (4) | V (10) | F (5) | F (9) | 2.07 |
| 6 | tls | yes | public | no | yes | V (16) | F (9) | V (4) | F (11) | V (5) | F (9) | 1.83 |
| 7 | tls | yes | public | no | no | V (16) | F (9) | V (4) | F (11) | F (5) | F (9) | 2.2 |
| 8 | tls | no | MAC | yes | yes | V (18) | F (10) | F (6) | V (8) | F (8) | V (17) | 2.39 |
| 9 | tls | no | MAC | yes | no | V (18) | F (10) | F (6) | V (8) | F (5) | V (17) | 2.72 |
| 10 | tls | no | MAC | no | yes | V (21) | F (10) | F (6) | F (9) | F (8) | F (12) | 4.38 |
| 11 | tls | no | MAC | no | no | V (21) | F (10) | F (6) | F (9) | F (5) | F (12) | 4.05 |
| 12 | tls | no | public | yes | yes | V (15) | F (9) | F (6) | V (8) | F (8) | F (9) | 2.12 |
| 13 | tls | no | public | yes | no | V (15) | F (9) | F (6) | V (8) | F (5) | F (9) | 2.89 |
| 14 | tls | no | public | no | yes | V (16) | F (9) | F (6) | F (9) | F (8) | F (9) | 2.9 |
| 15 | tls | no | public | no | no | V (16) | F (9) | F (6) | F (9) | F (5) | F (9) | 3.15 |
| 16 | plain | yes | MAC | yes | yes | V (13) | F (7) | V (4) | V (10) | F (4) | F (6) | 2.53 |
| 17 | plain | yes | MAC | yes | no | V (13) | F (7) | V (4) | V (10) | F (4) | F (6) | 2.74 |
| 18 | plain | yes | MAC | no | yes | V (13) | F (7) | V (4) | F (8) | F (4) | F (6) | 3.34 |
| 19 | plain | yes | MAC | no | no | V (13) | F (7) | V (4) | F (8) | F (4) | F (6) | 2.67 |
| 20 | plain | yes | public | yes | yes | V (10) | F (6) | V (4) | V (10) | F (4) | F (5) | 0.95 |
| 21 | plain | yes | public | yes | no | V (10) | F (6) | V (4) | V (10) | F (4) | F (5) | 1.04 |
| 22 | plain | yes | public | no | yes | V (10) | F (6) | V (4) | F (8) | F (4) | F (5) | 1.28 |
| 23 | plain | yes | public | no | no | V (10) | F (6) | V (4) | F (8) | F (4) | F (5) | 1.53 |
| 24 | plain | no | MAC | yes | yes | V (13) | F (7) | F (4) | V (8) | F (4) | F (6) | 2.3 |
| 25 | plain | no | MAC | yes | no | V (13) | F (7) | F (4) | V (8) | F (4) | F (6) | 2.44 |
| 26 | plain | no | MAC | no | yes | V (13) | F (7) | F (4) | F (6) | F (4) | F (6) | 2.35 |
| 27 | plain | no | MAC | no | no | V (13) | F (7) | F (4) | F (6) | F (4) | F (6) | 2.24 |
| 28 | plain | no | public | yes | yes | V (10) | F (6) | F (4) | V (8) | F (4) | F (5) | 1.47 |
| 29 | plain | no | public | yes | no | V (10) | F (6) | F (4) | V (8) | F (4) | F (5) | 1.19 |
| 30 | plain | no | public | no | yes | V (10) | F (6) | F (4) | F (6) | F (4) | F (5) | 1.21 |
| 31 | plain | no | public | no | no | V (10) | F (6) | F (4) | F (6) | F (4) | F (5) | 1.56 |

Every lemma on every point finished in a few seconds; no timeouts, no
wellformedness warnings; the largest theory is under 120 lines.

### Reading the table

- **All strong (point 0, preset `standard-compliant`)**: everything holds.
- **`reuse_guard` off (point 1, preset `two-time-pad`)**: only
  `message_secret` falls. SAE_A pads two messages with one key and
  `Eve_TwoTimePad` recovers both.
- **`consume` off (point 2)**: only `single_delivery` falls. SAE_B
  processes the (replayed) key-ID message twice and KME_B serves `kid`
  twice.
- **`sae_channel` plain (point 16, preset `plain-sae-channel`)**:
  `key_secret`, `message_secret` and `message_integrity` fall. The chart
  shows KME_A answering a request with `<kid, k>` on the public channel.
  `delivered_to_authorized` still holds because it is stated against what
  KME_A recorded, and the attacker can forge the master request itself.
- **`authorize_slave` off (points 8 to 15, preset `bearer-token`)**:
  `delivered_to_authorized` falls (E presents `kid` to KME_B and is
  served) and with it `key_secret` and `message_secret`, because the key
  that E obtains is the one SAE_A is using. `message_integrity` survives
  on points 8 and 9 only because E's fetch consumes the pool entry, so
  SAE_B never holds that key; with `consume` off as well (points 10 and
  11) SAE_B and E share the key and E's forged message is accepted.
- **`keyid_transport` public with authorization on (points 4 to 7)**:
  `key_secret` and `message_integrity` fall. E acts as a *master* at
  KME_A, names SAE_B as the slave, obtains `(kid', k')`, and pushes `kid'`
  to SAE_B over the public application channel. SAE_B fetches `k'`, a key
  the attacker knows, and accepts a message E forged under it. SAE_A's
  own key and message are untouched (`message_secret` holds). The MAC'd
  key-ID transport closes this.

## Disagreements with the expectation list

The expectation list named one falsified lemma per weak option. The
measurements agree on those and add consequences:

1. Bearer-token key IDs do not only break `delivered_to_authorized`; the
   key E fetches is SAE_A's working key, so `key_secret` and
   `message_secret` fall as well.
2. A public key-ID channel is not harmless even with slave authorization
   on: a registered third SAE can steer SAE_B onto a key it shares with
   KME_A (points 4 to 7). This is the model's reading of the GS QKD 020
   remark on SAE identity handling across a KME pair.
3. The plain SAE channel also breaks `message_secret` and
   `message_integrity`, not only `key_secret`.

## Modelling decisions and limits

- **TLS as a secure-channel fact.** A first version encoded the SAE-KME
  channel as `senc(<src, dst, msg>, k_sae)` with per-SAE keys. Tamarin's
  search on that encoding did not finish `executable` within 150 s (every
  `!KU(senc(...))` goal re-derived nested honest runs). `Sec(src, dst,
  msg)` is the same abstraction (confidential, both ends authenticated,
  no replay) and all lemmas finish in seconds. The per-SAE credential is
  represented by which identity may write to and read from `Sec`: SAE_A
  and SAE_B through their own rules, E through the two `Chan_` rules.
- **Two-time pad as a rule, not an equation.** A destructor
  `leak(otp(m1, k), otp(m2, k)) = m1` is unsound in the symbolic model
  because `leak(c, c)` decrypts a single ciphertext. The leak is therefore
  a rule with a `Neq(m1, m2)` restriction, and it consumes `!Pad(otp(m, k))`
  facts emitted by `SaeA_Send` rather than `In(otp(m, k))`: an attacker who
  could build `otp(m2, k)` itself would know `k` and need no leak, and the
  `In` form made Tamarin chase `c_otp` constructions (73 s for `key_secret`,
  `message_secret` over 100 s). The rule reveals both plaintexts; the real
  leakage is `m1 xor m2`, so this is a known-plaintext over-approximation.
- **`key_secret` is stated for QKD keys.** Without the `QkdKey` conjunct
  the shortest plain-channel counterexample is an attacker injecting its
  own key as "KME_A"; that case is still caught by `message_integrity`.
- **Authorization is stated against KME_A's record** (`MasterNamed`), which
  is what KME_B can enforce. A forged master request on a plain channel
  is therefore a `key_secret` failure, not an authorization failure.
- Single session, one KME pair, no key expiry, no KME-KME protocol, no
  TLS replay, and the `Get status` / `Get key` size and number parameters
  of 014 are not modelled.
- `grid()` returns all 32 combinations; every point proves in under 10 s
  so no reduction to the presets was necessary.
