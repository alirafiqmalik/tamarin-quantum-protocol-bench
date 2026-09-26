# QVerify : Proof Generation for QKD Protocol Verification

**Artifacts for:** *Beyond the Quantum Promise: A Security Analysis of Classical Control in Quantum Key Distribution*

This repository contains the Tamarin Prover models and tooling used to produce all verification results reported in the paper. Models are assembled from modular, reusable fragments covering entanglement-based (EB) and prepare-and-measure (PM) protocol variants, multiple error-correction schemes, and different basis-announcement orderings. The provided scripts automate the full pipeline — from model assembly to proof generation and result collection.

## Repository Layout

```
.
├── Makefile             # main entry point to compile and analyse models
├── main.m4              # m4 template used to assemble a single protocol model
├── generic_models/      # reusable Tamarin fragments
│   ├── EB/              # entanglement‑based protocol pieces
│   ├── PM/              # prepare‑and‑measure protocol pieces
│   ├── common/
│   │   ├── Basis_order/ # order of basis announcements
│   │   └── ER/          # error correction mechanisms
│   └── lemmas/          # generic lemmas for execution, secrecy and auth
└── tools/               # helper scripts and Tamarin binary
    ├── compile_models   # build all .spthy models under `output/`
    ├── gen_proofs       # run tamarin on each model and store .proof files
    ├── collect          # gather proof summaries into `output/generated_results.html`
    ├── clean_spthy      # helper to clean generated models
    ├── test_models      # optional sanity checks
    ├── check_incompleted# remove incomplete proof files
    ├── setup.sh         # add bundled Maude binaries to PATH
    └── tamarin-prover   # bundled tamarin executable
```

The `output/` directory (or `_output/` when using Docker) is created as needed and holds the generated protocol theories (`*.spthy`) and their corresponding proof logs (`*.proof`).

## Quick start

### Analysing a single variant
To generate and analyse one specific protocol instance you can call `make` with the desired parameters.  The following example creates a prepare‑and‑measure model using FEC error correction and sequential basis announcement A:

```bash
make type=PM ER=FEC BO=SeqA Adv=Network exec=true secrecy=true auth=true prove
```

This runs `m4` on `main.m4`, cleans the resulting file and invokes `tamarin-prover`.  The proof is written to `generated_PM.proof`.

### Generating all proofs
To compile every protocol combination and compute proofs for each run

```bash
make gen_proofs
```

This creates the `output/` directory (or `_output/` when using Docker), writes all `*.spthy` theory files there, runs Tamarin on each to produce `*.proof` files, then runs `collect` to generate `generated_results.html`.

### Using Docker (recommended for proof generation)

Tamarin is a Linux binary. To generate all proofs on any host, use Docker; outputs appear in `_output/` on your machine:

```bash
make docker-gen-proofs
```

Then open `_output/generated_results.html` for the summary.

### Interactive Tamarin mode via Docker

To use Tamarin's interactive web GUI inside Docker and access it in your browser:

```bash
make docker-web         # Single theory (default type=EB)
make docker-web-proofs  # All theories in _output/ (run docker-gen-proofs first)
```

The web UI is available at **http://localhost:3001** by default. Use `PORT=8080` (or another port) if 3001 is in use: `make docker-web PORT=8080`. See [filesforanalysis/Readme.md](filesforanalysis/Readme.md) for exporting dependency traces as PDFs.
