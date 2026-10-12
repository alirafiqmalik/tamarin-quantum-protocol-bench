# Tamarin Quantum Protocol Bench

An interactive local bench for assembling Tamarin theories of quantum protocols, inspecting the generated model, checking lemmas, and comparing modeling choices. This is the source code for the PQQS 2026 demonstration *An Interactive Bench for Symbolic Models of Quantum Protocols*.

## Requirements

- Python 3.9 or newer
- [Tamarin Prover](https://tamarin-prover.com/) on `PATH`, with its Maude dependency working
- `m4` on `PATH` for the QKD templates

The main demo uses only the Python standard library. The optional Tamarin ML API integration also requires `python3 -m pip install requests` and a separate `tamarin-prover-json` server on `127.0.0.1:3001`.

## Run

```sh
python3 app.py
```

Open <http://127.0.0.1:8765>. The server listens only on the local machine. Stop it with Ctrl-C. Generated theories and cached results go into the ignored `work/` directory.

For a short walk-through, load the QKD preset and verify its executability lemma. Then load the send model, verify the three lemmas, enable key exposure, and verify again. **Search abstractions** compares fixed model variants under Tamarin's `S` and `C` heuristics. The QKD comparison may take longer than the send-model checks.

## Test

```sh
python3 -m unittest -v tests.test_bench
```

The tests invoke a local Tamarin installation. They check assembly, send-model verdicts, and the comparison result. The ML API availability check passes when the optional server is absent.

## Included code and limits

`vendor/qkd-fev` contains the QKD-FEV fragment library used for the prepare-and-measure and entanglement-based configurations. The separate source project is described in its [README](vendor/qkd-fev/README.md). This repository omits that project's history, network simulators, bundled prover, Maude tree, and PDF traces.

`vendor/tamarin-ml-api` contains a Python client and example from the separate [Tamarin-ML-API project](https://github.com/niklasmedinger/Tamarin-ML-API/tree/main), together with its license. This repository does not include its Haskell prover. The ML API feature requires that server to be installed and started separately. All paper results use the installed Tamarin prover's built-in heuristics.

The illustrative send theory is generated in `bench/assemble.py`. It models a preshared key, one encoded message, and a MAC. Its key-exposure variant also outputs the key to the adversary. These symbolic equations and lemmas illustrate modeling choices. They are not a security claim about a deployed quantum channel.
