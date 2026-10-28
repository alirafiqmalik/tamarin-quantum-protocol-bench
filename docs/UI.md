# Front end (WP2)

Single-page app in `web/` (Vite 8, React 19, TypeScript strict, `motion` for animation, plain SVG for charts, vitest for tests). The production build is written to `static/`, which `app.py` serves at `/` with an SPA fallback.

## Run

Development, with the Python server on port 8780 for `/api`, `/catalog.json` and `/evidence/*` (all proxied by Vite):

```sh
python3 app.py                # 127.0.0.1:8780
cd web && npm install && npm run dev   # http://localhost:5173
```

Production build (writes `../static`, then `python3 app.py` serves it):

```sh
cd web && npm run build       # tsc -b && vite build
npm test                      # vitest, pure helpers only
npm run lint                  # oxlint
```

Archive bundle for a static host (no Python, no Tamarin): `npm run build:archive` runs the build, then `scripts/archive.mjs` writes `static/catalog.json` (snapshot of `GET /api/catalog`) and copies `evidence/` into `static/evidence/`. Upload `static/` anywhere.

## Modes

`boot()` in `src/lib/api.ts` tries `GET /api/catalog`. If that fails the app loads `/catalog.json` and `/evidence/index.json` instead and switches to **archive mode**: the top bar shows "archive mode: recorded runs", every Run button is disabled with a tooltip, the model diff and theory editor say they need the live server, and records are read from `/evidence/<path>`. In live mode the same records are read from `/api/evidence/<id>`. Both modes label every result as `live run` or `cached` (with the recorded time and Tamarin version), and a timed-out run is always shown as inconclusive.

## Views (`src/views`)

Routing is hash based (`#/home`, `#/a`, `#/b`, `#/c`), top tabs in `components/Nav.tsx`, keyboard reachable.

- `Home.tsx`: the one-paragraph story and the three station cards. The footer (`components/Footer.tsx`, shown on every page) lists the honesty rules from the plan.
- `StationA.tsx` "Simulate it, or prove it?": protocol (catalog), family (the `type` field when present), attacker strategy (from `sim.protocols[].strategies`), lemma. Left panel runs `experiment.step(n)` on `requestAnimationFrame` with stat tiles (shots, sifted, QBER or fidelity, CHSH when present, attacker knows, attacks detected vs present), the execution-space maze where each sampled shot lights one corridor route (grey ok, red error, dark red attacker), and the per-trial QBER histogram against the 10 % threshold. Right panel: Run Tamarin (streaming SSE, elapsed seconds, log tail), proof replay as green coverage spreading over the same maze plus a layered proof tree (red leaf for a found trace), the verdict card, and a picker of recorded runs matching the configuration. The takeaway line under both panels is computed by `lib/takeaway.ts`. The symbolic options are derived from the strategy: V2 forces PM/SeqA, V1 forces EB/PostM, V3 enables the agreement lemmas; the chosen lemma's flag switch is enabled automatically.
- `StationB.tsx` "Attack witness and the classical control plane": configuration form generated from the catalog fields (`components/ConfigForm.tsx`), presets with their story, lemma picker (lemmas whose switch is off are disabled), heuristic and time limit, Run or pick a recorded run, verdict card, message sequence chart (`components/SequenceChart.tsx`), proof replay, model diff between the previous and the current options (`POST /api/diff`, debounced, "Pin current as baseline"), the standards strip, and the collapsible theory editor (`components/TheoryDrawer.tsx`: load the assembled theory, edit, "Verify this text" posts `{theory, protocol, heuristic}`).
- `StationC.tsx` "Evidence matrix": environment strip (Tamarin, CPUs, platform, updated), a table per protocol with rows = configuration labels and columns = lemma names; cells are verified (green check), falsified (red cross, with V1/V2/V3 attribution), timeout or no result (amber "?"), not run (grey). A `≠paper` marker appears when a verdict differs from the catalog expectation. Clicking a cell opens a modal with the verdict card, proof replay and trace chart. "Download manifest" serializes the evidence index to JSON.

## Component map (`src/components`)

| Component | Used by | Purpose |
|---|---|---|
| `Nav`, `Footer` | App | Tabs, mode badge, honesty rules |
| `StatTiles` | A | KPI row |
| `ExecutionSpace` | A, `ProofReplay` | The maze (`lib/maze.ts`): lit sampled paths or proof coverage, red dot for a counterexample |
| `Histogram` | A | Per-trial error rate vs threshold, hover tooltips |
| `ProofTree`, `ProofReplay` | A, B, C | Layered tree from `proof.order` (`lib/tree.ts`), replayed over time; reduced motion jumps to the end |
| `VerdictCard` | A, B, C | Lemma, status, steps, time, Tamarin version, model hash, live/cached, attribution |
| `SequenceChart` | B, C | Lanes from `trace.lanes` in canonical order (`lib/lanes.ts`), events at y = row, arrows colored by channel with distinct arrowheads, violation highlight, "hide attacker bookkeeping" toggle, hover/focus tooltips with the full term |
| `DiffView` | B | Unified diff with +/- colors, stats, changed rule names (`lib/diff.ts`) |
| `ConfigForm`, `Presets`, `LemmaPicker`, `StandardsStrip`, `TheoryDrawer`, `RunLog`, `RecordPicker`, `Modal`, `Tooltip` | B, C | Form and chrome pieces |

## Library (`src/lib`)

- `api.ts`: types for every endpoint in `docs/API.md`, `boot()` (live or archive), `api.*` helpers, `verifyStream()` (fetch + ReadableStream SSE reader) and `loadRecord()`.
- `sse.ts`, `diff.ts`, `lanes.ts`, `takeaway.ts`, `tree.ts`, `maze.ts`, `evidence.ts`: pure helpers, each with a vitest file next to it.
- `run.ts`: `useRun()` state machine shared by the stations (live stream, cached record, cancel, reset) and `recordToResult()`.
- `sim.ts`: loads `web/src/sim/index.ts` through `import.meta.glob` (so a missing module is not a build error) and falls back to `simStub.ts`; `simProtocolId()` maps catalog protocols to simulator ids (qkd PM → `bb84`, qkd EB → `ebqkd`, teleport, superdense, qss, cka).
- `hooks.ts`: hash route, `prefers-reduced-motion`, elapsed timer. `context.ts`: app context (mode, catalog, environment, evidence).

## Motion and accessibility

Every animation (lit paths fading, coverage cells, tree nodes, counterexample pulse) has a reduced branch that renders the final state when `prefers-reduced-motion` is set. Charts use text tokens for labels, a legend for every multi-series picture, hover and keyboard-focus tooltips, and shapes next to colors (arrowheads per channel, glyphs per verdict) so nothing relies on color alone. The layout targets a 1280 px booth screen and collapses to one column below 980 px.

## Palette

Warm paper palette from the old page: paper `#f6f3ec`, panel `#fffdf8`, ink `#1c1915`; proved green `#0f6e56`, attack red `#9a3412`, pending amber `#8a5a12`, unexplored grey `#8a8378`. Channels in the sequence chart: quantum violet `#8b2fb0`, authenticated classical blue `#2563eb`, public grey, state dotted grey (the violet/blue pair passes the CVD separation check of the dataviz validator).
