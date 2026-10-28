# Simulate it, or prove it?

An interactive bench for symbolic (Tamarin) verification of quantum protocols together with their classical control plane, side by side with a quantum simulator that samples executions.

The demo makes three points:

1. Simulation samples executions. A proof covers every execution the attacker model permits. The attacks that matter (V1 entanglement injection, V2 basis-deferred measurement, V3 message reflection) leave the sampled error rate at zero, so sampling never finds them. Tamarin finds the counterexample.
2. The classical control plane of a quantum protocol (authentication, announcement order, reconciliation, key delivery) is where the specification-level failures are. The standards (ETSI GS QKD 004/005/014, ITU-T) leave these choices open.
3. The same method scales: 36 QKD configurations from one m4 template, two countermeasure switches, and five more protocols (teleportation, superdense coding, quantum secret sharing, conference key agreement, ETSI 014 key delivery and use).

## Run

```sh
./run.sh            # builds the front end if needed, then serves http://127.0.0.1:8780
./run.sh --port 9000
```

Needs `tamarin-prover` (1.12.0 was used), `maude`, `m4`, Python 3.11+, and Node 20+ for the front-end build. Without Node the server serves the prebuilt `static/` directory.

Static hosting (no server, recorded runs only): build, run `python3 -m bench.archive`, and host the `static/` directory. The page detects the missing server and switches to archive mode.

## Stations

- **A. Simulate it, or prove it?** One protocol, two panels. Left: the browser simulator runs shots and shows QBER, CHSH, attacker knowledge, and a histogram against the detection threshold. Right: Tamarin proves the selected lemma; the proof tree replays as coverage over the same picture, or a counterexample appears.
- **B. Attack witness.** Configuration switches, presets, a model diff, the standards strip, and the counterexample as a message sequence chart generated from Tamarin's JSON trace.
- **C. Evidence matrix.** Every recorded run: configuration × lemma with verified, falsified (with V1/V2/V3 attribution), timeout, or not run. Each cell opens its record. The manifest downloads as JSON.

## Layout

```
app.py            HTTP server (standard library), streaming verify, evidence routes
run.sh, Makefile  start, test, build, evidence, archive
bench/
  registry.py     protocol registry (every module in bench/protocols with a PROTOCOL dict)
  protocols/      qkd, teleport, superdense, qss, cka, keyuse, qsend
  prove.py        tamarin-prover wrapper: verdicts, proof trees, JSON traces, cache
  trace.py        JSON trace -> message sequence chart
  prooftree.py    proof text -> tree for the coverage replay
  batch.py        offline evidence generation; manifest.py records and index
  archive.py      static bundle (catalog.json + evidence/) into static/
sim/              numpy cross-check of the browser simulator (python3 -m sim --help)
web/              Vite + React + TypeScript front end; web/src/sim is the simulator
static/           built front end (served by app.py)
evidence/         recorded runs (index.json + one JSON per run)
vendor/qkd-fev/   QKD-FEV fragments with the CM1/CM2 switches added
docs/             API, UI, SIM, PROTOCOLS, KEYUSE, COUNTERMEASURES
tests/            unittest suites (Python) and vitest (web)
```

## Evidence

```sh
make evidence                       # all protocols, every grid point, every lemma
TAMARIN_CORES=8 TIMEOUT=600 make evidence
python3 -m bench.batch --protocol qkd --lemma secret_key_A
```

Each record stores the m4 options, model hash, Tamarin version, heuristic, time, verdict, the proof tree, and the trace. A timeout or an empty result is inconclusive. `python3 -m bench.batch` skips finished records and retries inconclusive ones.

## Tests

```sh
make test                           # python unittest + vitest
python3 -m unittest tests.test_bench tests.test_app
```

The protocol tests call Tamarin and take about half a minute. Set `TAMARIN_CORES=4` to limit the prover when something else is running.

## Honesty rules shown in the interface

- Live and cached results are labeled with the recorded time and Tamarin version.
- A timeout is inconclusive, never a verdict.
- The simulator models ideal devices with optional depolarizing noise and makes no physical security claim.
- CM1 and CM2 are this demo's encodings of the published countermeasures. The measured results differ from the paper in places (see `docs/COUNTERMEASURES.md`), and the matrix marks every such cell.
- The new protocol models are small single-session abstractions; `docs/PROTOCOLS.md` and `docs/KEYUSE.md` list their limits.

## Sources

QKD fragments: QKD-FEV / QVerify (Malik et al., "Beyond the Quantum Promise"). Prover: Tamarin 1.12.0. The optional Tamarin ML API client remains in `vendor/tamarin-ml-api` but is not used by the page.
