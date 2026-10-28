import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type DiffResult, type EvidenceSummary, type LemmaMeta, type Options, type Preset } from '../lib/api'
import { useApp } from '../lib/context'
import { attribution, findRecords } from '../lib/evidence'
import { useElapsed, useReducedMotion } from '../lib/hooks'
import { useRun } from '../lib/run'
import { pickLemma } from '../lib/takeaway'
import { ConfigForm, defaultOptions } from '../components/ConfigForm'
import { DiffView } from '../components/DiffView'
import { LemmaPicker } from '../components/LemmaPicker'
import { Presets } from '../components/Presets'
import { ProofReplay } from '../components/ProofReplay'
import { RecordPicker } from '../components/RecordPicker'
import { RunLog } from '../components/RunLog'
import { SequenceChart } from '../components/SequenceChart'
import { StandardsStrip } from '../components/StandardsStrip'
import { TheoryDrawer } from '../components/TheoryDrawer'
import { VerdictCard } from '../components/VerdictCard'

export function StationB() {
  const app = useApp()
  const reduced = useReducedMotion()
  const live = app.mode === 'live'
  const protocols = app.catalog.protocols
  const [protocolId, setProtocolId] = useState(protocols.find((p) => p.id === 'qkd')?.id ?? protocols[0]?.id ?? '')
  const protocol = protocols.find((p) => p.id === protocolId) ?? protocols[0]
  const [options, setOptions] = useState<Options>(() => (protocol ? defaultOptions(protocol.fields) : {}))
  const [baseline, setBaseline] = useState<Options>(options)
  const [lemmaName, setLemmaName] = useState<string | null>(null)
  const [heuristic, setHeuristic] = useState('S')
  const [timeout, setTimeoutS] = useState(120)
  const [presetStory, setPresetStory] = useState<string | null>(null)
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [theory, setTheory] = useState('')
  const [theoryLabel, setTheoryLabel] = useState('')
  const [recordId, setRecordId] = useState<string | null>(null)

  const lemmaEnabled = useCallback((l: LemmaMeta) => !l.flag || !protocol?.fields.some((f) => f.key === l.flag && f.kind === 'bool') || Boolean(options[l.flag]), [protocol, options])
  const lemma = useMemo(() => {
    if (!protocol) return null
    const chosen = protocol.lemmas.find((l) => l.name === lemmaName)
    if (chosen && lemmaEnabled(chosen)) return chosen
    return protocol.lemmas.find(lemmaEnabled) ?? null
  }, [protocol, lemmaName, lemmaEnabled])

  const switchProtocol = (id: string) => {
    const p = protocols.find((x) => x.id === id)
    if (!p) return
    setProtocolId(id)
    const d = defaultOptions(p.fields)
    setOptions(d)
    setBaseline(d)
    setLemmaName(null)
    setPresetStory(null)
    setDiff(null)
    setTheory('')
    setTheoryLabel('')
  }

  const changeOptions = (next: Options) => {
    setBaseline(options)
    setOptions(next)
    setPresetStory(null)
  }
  const applyPreset = (p: Preset) => {
    setBaseline(options)
    setOptions({ ...options, ...p.options })
    setPresetStory(p.story ?? null)
  }

  // model diff between the previous and the current options
  const diffSeq = useRef(0)
  useEffect(() => {
    if (!protocol || !live) return
    const same = JSON.stringify(baseline) === JSON.stringify(options)
    if (same) { setDiff(null); return }
    diffSeq.current += 1
    const my = diffSeq.current
    const t = window.setTimeout(() => {
      api.diff(protocol.id, baseline, options).then((d) => { if (my === diffSeq.current) { setDiff(d); setDiffError(null) } }).catch((e) => { if (my === diffSeq.current) setDiffError(e instanceof Error ? e.message : String(e)) })
    }, 250)
    return () => window.clearTimeout(t)
  }, [protocol, baseline, options, live])

  const { state: runState, run, cancel, replayRecord, reset } = useRun(app.mode)
  const elapsed = useElapsed(runState.running, runState.startedAt)
  const allRecords = useMemo(() => Object.values(app.evidence.records), [app.evidence])
  const matching = useMemo(() => (protocol ? findRecords(allRecords, protocol.id, options, null) : []), [allRecords, protocol, options])

  const startRun = () => { if (protocol) { setRecordId(null); void run({ protocol: protocol.id, options, heuristic, timeout, lemma: lemma?.name ?? null }) } }
  const verifyText = (text: string) => { if (protocol) { setRecordId(null); void run({ protocol: protocol.id, options, heuristic, timeout, theory: text }) } }
  const pickRecord = (r: EvidenceSummary) => { setRecordId(r.id); setLemmaName(r.lemma); void replayRecord(r) }
  const loadTheory = async () => {
    if (!protocol) return
    const a = await api.assemble(protocol.id, options)
    setTheory(a.theory)
    setTheoryLabel(a.label)
  }

  const configKey = `${protocol?.id}|${JSON.stringify(options)}`
  const prevKey = useRef(configKey)
  useEffect(() => { if (prevKey.current !== configKey) { prevKey.current = configKey; reset(); setRecordId(null) } }, [configKey, reset])

  const result = runState.result
  const lemmaResult = pickLemma(result, recordId ? app.evidence.records[recordId]?.lemma : lemma?.name)
  const meta = protocol?.lemmas.find((l) => l.name === lemmaResult?.name) ?? lemma ?? undefined
  const record = recordId ? app.evidence.records[recordId] : undefined
  const attr = attribution(record, protocol)

  if (!protocol) return <p>No protocols in the catalog.</p>

  return (
    <div>
      <p className="eyebrow">Station B</p>
      <h1 style={{ fontSize: 26 }}>Attack witness and the classical control plane</h1>
      <p className="lead muted">{protocol.story ?? protocol.blurb}</p>
      <div className="side-col">
        <div className="stack">
          <section className="panel">
            <label className="field" htmlFor="b-protocol">Protocol</label>
            <select id="b-protocol" value={protocol.id} onChange={(e) => switchProtocol(e.target.value)}>
              {protocols.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ConfigForm fields={protocol.fields} value={options} onChange={changeOptions} idPrefix="b" />
            {protocol.presets?.length ? (
              <>
                <p className="eyebrow" style={{ marginTop: 12 }}>Presets</p>
                <Presets presets={protocol.presets} value={options} onPick={applyPreset} />
                {presetStory ? <p className="help">{presetStory}</p> : null}
              </>
            ) : null}
          </section>
          <section className="panel">
            <p className="eyebrow">Lemma</p>
            <LemmaPicker lemmas={protocol.lemmas} value={lemma?.name ?? null} onChange={setLemmaName} enabled={lemmaEnabled} />
            <div className="row" style={{ marginTop: 10 }}>
              <label className="small" htmlFor="b-heuristic">Heuristic</label>
              <select id="b-heuristic" style={{ width: 70 }} value={heuristic} onChange={(e) => setHeuristic(e.target.value)}>
                {app.catalog.heuristics.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <label className="small" htmlFor="b-timeout">Limit (s)</label>
              <input id="b-timeout" type="number" min={5} max={600} style={{ width: 80 }} value={timeout} onChange={(e) => setTimeoutS(Math.max(5, Math.min(600, Number(e.target.value) || 60)))} />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              {runState.running ? (
                <button type="button" className="secondary" onClick={cancel}>Cancel ({Math.round(elapsed)} s)</button>
              ) : (
                <button type="button" onClick={startRun} disabled={!live || !lemma} title={live ? 'Run Tamarin on this lemma' : 'Archive mode: live runs are disabled'}>Run Tamarin</button>
              )}
            </div>
            {!live ? <p className="help">Archive mode: recorded runs only.</p> : null}
          </section>
          <section className="panel">
            <RecordPicker records={matching} selected={recordId} onPick={pickRecord} title="Recorded runs for this configuration" />
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <p className="eyebrow">Verdict</p>
              <span className="status-line">{runState.running ? `${runState.status} ${Math.round(elapsed)} s elapsed.` : runState.status}</span>
            </div>
            {runState.error ? <RunLog lines={[]} error={runState.error} /> : null}
            {result ? (
              <VerdictCard lemma={lemmaResult} meta={meta} seconds={result.seconds} version={result.version} hash={result.hash} timedOut={result.timed_out} source={runState.source} recorded={runState.recorded} label={result.label} attribution={attr?.tag ?? null} />
            ) : (
              <p className="help">Run the selected lemma or pick a recorded run. Falsified all-traces lemmas and verified exists-trace lemmas come with a trace.</p>
            )}
            {runState.running || runState.log.length ? <RunLog lines={runState.log} collapsed={!runState.running} /> : null}
          </section>

          {lemmaResult?.trace ? (
            <section className="panel">
              <div className="panel-head">
                <p className="eyebrow" title={lemmaResult.trace.label}>Message sequence chart · {lemmaResult.name}</p>
                <span className="small muted">{lemmaResult.trace.size} nodes in the Tamarin trace</span>
              </div>
              <SequenceChart trace={lemmaResult.trace} />
            </section>
          ) : result && lemmaResult ? (
            <section className="panel">
              <p className="eyebrow">Message sequence chart</p>
              <p className="help">{result.timed_out ? 'Timed out: no trace and no verdict.' : lemmaResult.verified && lemmaResult.quantifier === 'all-traces' ? 'Verified for all traces: there is no counterexample to draw.' : 'No trace attached to this result.'}</p>
            </section>
          ) : null}

          {result && lemmaResult?.proof ? (
            <section className="panel">
              <p className="eyebrow">Proof replay</p>
              <ProofReplay lemma={lemmaResult} timedOut={result.timed_out} reduced={reduced} replayKey={runState.replayKey} showMaze={false} />
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-head">
              <p className="eyebrow">Model diff</p>
              <button type="button" className="ghost small" onClick={() => setBaseline(options)} disabled={JSON.stringify(baseline) === JSON.stringify(options)}>Pin current as baseline</button>
            </div>
            {!live ? <p className="help">Model diffs need the live server (POST /api/diff).</p> : diffError ? <p className="status-line error">{diffError}</p> : diff ? <DiffView a={diff.a} b={diff.b} lines={diff.diff} /> : <p className="help">Change a control-plane switch or pick a preset to see exactly which rules change in the Tamarin model.</p>}
          </section>

          <StandardsStrip standards={protocol.standards ?? []} />

          <TheoryDrawer theory={theory} label={theoryLabel} heuristics={app.catalog.heuristics} heuristic={heuristic} onHeuristic={setHeuristic} onLoad={loadTheory} onVerifyText={verifyText} busy={runState.running} live={live} />
        </div>
      </div>
    </div>
  )
}
