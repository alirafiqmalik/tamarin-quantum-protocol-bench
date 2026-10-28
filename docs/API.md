# Bench HTTP API

The server is `app.py` (Python standard library, one Tamarin run at a time). Default bind `127.0.0.1:8780`.

## GET /api/catalog

```json
{
  "heuristics": ["S","C","I","s","c","i"],
  "groups": [{"id":"qkd","name":"...","blurb":"..."}, ...],
  "protocols": [
    {
      "id": "qkd", "name": "...", "group": "qkd", "blurb": "...", "story": "...",
      "fields": [
        {"key":"type","label":"Family","kind":"choice","default":"PM","options":[{"id":"PM","label":"..."}]},
        {"key":"exec","label":"...","kind":"bool","default":true}
      ],
      "lemmas": [{"name":"secret_key_A","kind":"all-traces","title":"...","desc":"...","flag":"secrecy"}],
      "presets": [{"id":"...","label":"...","options":{...},"story":"..."}],
      "standards": [{"clause":"ETSI GS QKD 005 V1.1.1","text":"..."}],
      "lanes": [["alice",["Alice"]],["bob",["Bob"]],["eve",["Eve"]],["channel",["Setup","QChan","Chan"]]]
    }
  ]
}
```

`lanes` maps rule-name prefixes to sequence-chart lanes. The `qkd` protocol also carries `expectations`: a flat list of `{type, bo, er, cm: "baseline"|"CM1"|"CM2"|"CM1+CM2", lemma, paper: "verified"|"falsified"|..., vuln: "V1"|"V2"|"V3"|null, source: "table"|"prose"}` rows transcribed from the QVerify paper, so the UI can show "paper: falsified (V2)" next to a measured verdict. Intruder deduction steps always land in lane `attacker`; unmatched protocol rules land in `network`.

## GET /catalog.json

Same payload as `/api/catalog`. The archive bundle (`python3 -m bench.archive`) writes the same file to `static/catalog.json`, so the front end uses this URL in both modes.

## GET /evidence/<path>

Serves files from the `evidence/` directory (`index.json`, `<protocol>/<id>.json`). The archive bundle copies the directory to `static/evidence/`.

## GET /api/environment

`{"tamarin":"1.12.0","python":"3.14.8","platform":"...","cpus":32}`

## POST /api/assemble

Request `{"protocol":"qkd","options":{...}}`. Missing options take the catalog defaults.
Response `{"theory":"...","label":"PM / Network / FEC / A2B","lemmas":["executability_success",...],"options":{...normalized}}`.

## POST /api/diff

Request `{"protocol":"qkd","a":{...},"b":{...}}`. Response `{"a":label,"b":label,"diff":[unified diff lines]}`.

## POST /api/verify

Request:
```json
{"protocol":"qkd","options":{...},"heuristic":"S","timeout":60,"lemma":"secret_key_A","stream":true,"theory":"optional edited text"}
```
- `lemma` optional: restrict the run to one lemma. Without it every lemma in the theory runs.
- `theory` optional: verify the given text instead of assembling. `include(` is refused.
- `timeout` seconds, clamped to 5..600.
- `stream: true` returns `text/event-stream` with events `status`, `log` (`{"line":...}`), `tick` (heartbeat every second), `result` (the result object below), `error`.
- Without `stream` the response is the result object directly. HTTP 409 when another run is active.

Result object:
```json
{
  "key": "sha256 of version+heuristic+lemma+text",
  "label": "...", "heuristic": "S", "lemma": null, "version": "1.12.0", "hash": "sha256 of theory",
  "seconds": 12.65, "wall": 13.1, "timed_out": false, "warning": false, "cached": false, "log": "last 60 lines",
  "lemmas": [
    {
      "name": "secret_key_A", "quantifier": "all-traces", "status": "falsified - found trace", "verified": false, "steps": 15,
      "proof": {"size": 29, "depth": 27, "status": "trace|closed|open|mixed",
                "order": [{"i":0,"p":null,"d":0,"kind":"lemma|simplify|induction|solve|case|leaf","label":"...","status":"..."}]},
      "trace": {
        "label": "...", "lanes": ["alice","channel","attacker"], "size": 39,
        "events": [{"id":"#vr.5","t":3,"lane":"alice","rule":"Alice_Send_BA","kind":"rule|attacker","actions":["Send_BA( 'A', 'A', BA(~ba) )"],"violation":false}],
        "messages": [{"from":"#vr.5","to":"#vr.9","fromLane":"alice","toLane":"channel","t":5,"fact":"Out_Auth","label":"short","full":"long","channel":"quantum|classical-auth|public|state","relation":"ProtoFact"}],
        "violation": ["#i"]
      }
    }
  ]
}
```
`proof.order` is a pre-order list of the proof tree for replay: `i` index, `p` parent index, `d` depth. `trace` is present for falsified all-traces lemmas and for verified exists-trace lemmas; otherwise `null`. A timed-out run has `timed_out: true` and usually an empty `lemmas` list. Treat it as inconclusive.

## POST /api/compare

Request `{"protocol":"qsend","options":{...},"timeout":40}`. Runs the fixed variant comparison (`bench/learn.py`). Response `{"attempts":[...],"best":{...},"note":"..."}`.

## GET /api/evidence

The offline evidence index written by `python3 -m bench.batch`:
```json
{"environment":{...},"updated":"...","records":{"<id>":{"id":"...","protocol":"qkd","options":{...},"label":"...","lemma":"...","heuristic":"S","status":"verified|falsified - found trace|timeout|...","verified":true,"steps":21,"seconds":12.6,"timed_out":false,"hash":"...","recorded":"...","path":"qkd/<id>.json"}}}
```

`status` is the Tamarin summary text (`verified`, `falsified - found trace`, `analysis incomplete`), or `timeout`, or `no result` when the prover produced no summary (for example a wellformedness abort). Treat anything other than `verified` and `falsified - found trace` as inconclusive.

## GET /api/evidence/<id>

The full record: index fields plus `quantifier`, `wall`, `version`, `proof`, `trace`, `log`, `theory_file`.

## Archive mode

The front end must also run with no server: load `evidence/index.json` and `evidence/<path>` as static files, plus a static `catalog.json` snapshot. Live verification is disabled and labeled in that mode.
