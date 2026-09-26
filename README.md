# Symbolic model bench

Local page for assembling Tamarin theories of quantum protocols, checking lemmas, and searching modeling choices.

## Run

```sh
python3 app.py
```

Open http://127.0.0.1:8765

Needs `tamarin-prover` and `m4` on `PATH`.

## What is included

`vendor/qkd-fev` is the QKD-FEV fragment library: prepare-and-measure and entanglement-based control models, basis order, and error reconciliation. The clone's git history, network simulators, bundled prover, Maude tree, and PDF traces are not in this directory.

`vendor/tamarin-ml-api` is the Python client and example from the Tamarin ML API, plus that project's license. The Haskell prover tree is not included. This machine has no GHC, so the page cannot build `tamarin-prover-json`. If that server is already listening on port 3001 and returns the API overview, the page lists its theories and asks for the initial proof methods of a lemma.

Quantum send is defined in `bench/assemble.py`. It is a separate channel model: one preshared key, one encoded message, one MAC. One variant also writes the key to the network.

## Checks

```sh
python3 -m unittest tests.test_bench
```

The quantum-send tests call Tamarin. The QKD executability check is available from the page and takes longer than the unit tests.
