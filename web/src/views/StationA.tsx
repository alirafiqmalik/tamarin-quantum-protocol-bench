import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LemmaMeta, Options, Protocol } from '../lib/api'
import { useApp } from '../lib/context'
import { attribution, findRecords } from '../lib/evidence'
import { defaultOptions } from '../components/ConfigForm'
import { fmtInt, fmtPct } from '../lib/format'
import { useElapsed, useReducedMotion } from '../lib/hooks'
import { useRun } from '../lib/run'
import { loadSim, simProtocolId, type LoadedSim } from '../lib/sim'
import { pickLemma, takeaway, type SimSummary } from '../lib/takeaway'
import type { Counters, Experiment, ProtocolInfo, Schedule, Strategy, StrategyInfo } from '../sim/types'
import { ExecutionSpace, type LitPath } from '../components/ExecutionSpace'
import { Histogram } from '../components/Histogram'
import { ProofReplay } from '../components/ProofReplay'
import { RecordPicker } from '../components/RecordPicker'
import { RunLog } from '../components/RunLog'
import { StatTiles, type Tile } from '../components/StatTiles'
import { VerdictCard } from '../components/VerdictCard'

const THRESHOLD = 0.1
const FADE_MS = 1400
const LIVE_TIMEOUT = 120

/** Options for the symbolic model implied by the chosen family and attacker strategy. */
function deriveOptions(protocol: Protocol, family: string | null, strategy: StrategyInfo | null, lemma: LemmaMeta | null): Options {
  const opts = defaultOptions(protocol.fields)
  if (protocol.id === 'qkd') {
    if (family) opts.type = family
    if (strategy?.maps === 'V2') { opts.type = 'PM'; opts.bo = 'SeqA'; opts.adv = 'Network' }
    if (strategy?.maps === 'V1') { opts.type = 'EB'; opts.bo = 'PostM'; opts.adv = 'Network' }
    if (strategy?.maps === 'V3') { opts.auth = true }
  }
  if (lemma?.flag && protocol.fields.some((f) => f.key === lemma.flag && f.kind === 'bool')) opts[lemma.flag] = true
  return opts
}

function defaultLemma(protocol: Protocol, strategy: StrategyInfo | null): LemmaMeta | null {
  const by = (re: RegExp) => protocol.lemmas.find((l) => re.test(l.name)) ?? null
  if (strategy?.maps === 'V3') return by(/weak_agreement|agreement/) ?? protocol.lemmas[0] ?? null
  if (strategy?.maps === 'V1' || strategy?.maps === 'V2') return by(/secret/) ?? protocol.lemmas[0] ?? null
  if (strategy && strategy.id !== 'none') return by(/secret|integrity/) ?? protocol.lemmas[0] ?? null
  return by(/execut/) ?? protocol.lemmas[0] ?? null
}

function scheduleFor(options: Options): Schedule {
  const bo = String(options.bo ?? '')
  return {
    basisOrder: bo === 'SeqA' ? 'A2B' : bo === 'SeqB' ? 'B2A' : 'none',
    dealerOrder: options.dealer === 'last' ? 'last' : 'first',
    authenticated: true,
    identityBound: Boolean(options.cm2),
    commitment: Boolean(options.cm1),
  }
}

export function StationA() {
  const app = useApp()
  const reduced = useReducedMotion()
  const protocols = app.catalog.protocols
  const [protocolId, setProtocolId] = useState(protocols.find((p) => p.id === 'qkd')?.id ?? protocols[0]?.id ?? '')
  const protocol = protocols.find((p) => p.id === protocolId) ?? protocols[0]
  const familyField = protocol?.fields.find((f) => f.key === 'type' && f.kind === 'choice')
  const [family, setFamily] = useState<string | null>(familyField ? String(familyField.default ?? 'PM') : null)
  const [loaded, setLoaded] = useState<LoadedSim | null>(null)
  const [strategyId, setStrategyId] = useState<Strategy>('none')
  const [lemmaName, setLemmaName] = useState<string | null>(null)
  const [noise, setNoise] = useState(0.02)
  const [paused, setPaused] = useState(false)

  useEffect(() => { void loadSim().then(setLoaded) }, [])

  const simId = protocol ? simProtocolId(protocol.id, { type: family }) : null
  const simProto: ProtocolInfo | null = useMemo(() => (loaded && simId ? loaded.sim.protocols.find((p) => p.id === simId) ?? null : null), [loaded, simId])
  const strategy = simProto?.strategies.find((s) => s.id === strategyId) ?? simProto?.strategies[0] ?? null
  const lemma: LemmaMeta | null = useMemo(() => (protocol ? protocol.lemmas.find((l) => l.name === lemmaName) ?? defaultLemma(protocol, strategy) : null), [protocol, lemmaName, strategy])
  const options = useMemo(() => (protocol ? deriveOptions(protocol, family, strategy, lemma) : {}), [protocol, family, strategy, lemma])
  const schedule = useMemo(() => scheduleFor(options), [options])

  // ---- simulation loop -------------------------------------------------------
  const expRef = useRef<Experiment | null>(null)
  const [counters, setCounters] = useState<Counters | null>(null)
  const [trialQbers, setTrialQbers] = useState<number[]>([])
  const [detectedTrials, setDetectedTrials] = useState(0)
  const [paths, setPaths] = useState<LitPath[]>([])
  const [note, setNote] = useState<string | undefined>()
  const pathSeq = useRef(0)

  const resetSim = useCallback(() => {
    if (!loaded || !simId || !strategy) { expRef.current = null; return }
    expRef.current = loaded.sim.create({ protocol: simId, strategy: strategy.id, schedule, noise, threshold: THRESHOLD, seed: 42 })
    setCounters(expRef.current.counters())
    setTrialQbers([])
    setDetectedTrials(0)
    setPaths([])
    setNote(undefined)
  }, [loaded, simId, strategy, schedule, noise])

  useEffect(() => { resetSim() }, [resetSim])

  useEffect(() => {
    if (paused || !expRef.current) return
    let id = 0
    let last = performance.now()
    let acc = 0
    const perSecond = reduced ? 1500 : 6000
    const tick = (now: number) => {
      const exp = expRef.current
      if (!exp) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      acc += dt
      const n = Math.max(1, Math.round(perSecond * dt))
      const batch = exp.step(n)
      if (acc >= (reduced ? 0.4 : 0.08)) {
        acc = 0
        setCounters(batch.counters)
      }
      if (batch.trials.length) {
        setTrialQbers((q) => [...q.slice(-1999), ...batch.trials.map((t) => (t.fidelity != null && t.qber === 0 ? 1 - t.fidelity : t.qber))])
        setDetectedTrials((d) => d + batch.trials.filter((t) => t.detected).length)
      }
      if (batch.note) setNote(batch.note)
      if (batch.paths.length) {
        const stamp = now
        const fresh = batch.paths.slice(0, 2).map((p) => ({ ...p, key: `${stamp}-${pathSeq.current++}` }))
        setPaths((prev) => {
          const kept = reduced ? [] : prev.filter((p) => stamp - Number(p.key.split('-')[0]) < FADE_MS)
          return [...kept.slice(-10), ...fresh]
        })
      }
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [paused, reduced, loaded, simId, strategy, schedule, noise])

  // ---- verification ----------------------------------------------------------
  const { state: runState, run, cancel, replayRecord, reset: resetRun } = useRun(app.mode)
  const elapsed = useElapsed(runState.running, runState.startedAt)
  const allRecords = useMemo(() => Object.values(app.evidence.records), [app.evidence])
  const matching = useMemo(() => (protocol ? findRecords(allRecords, protocol.id, options, lemma?.name ?? null) : []), [allRecords, protocol, options, lemma])
  const [recordId, setRecordId] = useState<string | null>(null)

  const startRun = () => {
    if (!protocol) return
    void run({ protocol: protocol.id, options, heuristic: 'S', timeout: LIVE_TIMEOUT, lemma: lemma?.name ?? null })
  }
  const pickRecord = (r: (typeof matching)[number]) => { setRecordId(r.id); void replayRecord(r) }

  // reset the proof panel when the configuration changes
  const configKey = `${protocol?.id}|${JSON.stringify(options)}|${lemma?.name}`
  const prevKey = useRef(configKey)
  useEffect(() => {
    if (prevKey.current !== configKey) { prevKey.current = configKey; resetRun(); setRecordId(null) }
  }, [configKey, resetRun])

  const result = runState.result
  const lemmaResult = pickLemma(result, lemma?.name)
  const attacksPresent = Boolean(strategy && strategy.id !== 'none')
  const summary: SimSummary | null = counters ? { shots: counters.shots, detected: counters.detected, attacksPresent, qber: counters.qber, eveKnows: counters.eveKnows, strategyLabel: strategy?.label } : null
  const line = takeaway(summary, result, lemmaResult, runState.running, elapsed)
  const record = recordId ? app.evidence.records[recordId] : undefined
  const attr = attribution(record, protocol)

  const tiles: Tile[] = counters ? [
    { label: 'Shots', value: fmtInt(counters.shots) },
    { label: 'Sifted', value: fmtInt(counters.sifted) },
    counters.fidelity != null
      ? { label: 'Fidelity', value: counters.fidelity.toFixed(3), tone: counters.fidelity < 0.9 ? 'bad' : 'neutral' }
      : { label: 'QBER', value: fmtPct(counters.qber), sub: `threshold ${Math.round(THRESHOLD * 100)} %`, tone: counters.qber > THRESHOLD ? 'bad' : 'neutral' },
    ...(counters.chsh != null ? [{ label: 'CHSH S', value: counters.chsh.toFixed(2), sub: 'classical bound 2' } as Tile] : []),
    { label: 'Attacker knows', value: fmtPct(counters.eveKnows, 0), tone: counters.eveKnows > 0.5 ? 'bad' : 'neutral' },
    { label: 'Attacks detected', value: `${fmtInt(detectedTrials)} / ${fmtInt(attacksPresent ? counters.trials : 0)}`, sub: attacksPresent ? 'detected / present (trials)' : 'no attack in this run', tone: attacksPresent && detectedTrials === 0 && counters.trials > 2 ? 'bad' : attacksPresent ? 'good' : 'neutral' },
  ] : []

  if (!protocol) return <p>No protocols in the catalog.</p>

  return (
    <div>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div>
          <p className="eyebrow">Station A</p>
          <h1 style={{ fontSize: 26 }}>Simulate it, or prove it?</h1>
        </div>
        <div className="row">
          <label className="small" htmlFor="a-protocol">Protocol</label>
          <select id="a-protocol" style={{ width: 220 }} value={protocol.id} onChange={(e) => { setProtocolId(e.target.value); setLemmaName(null); setStrategyId('none') }}>
            {protocols.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {familyField ? (
            <>
              <label className="small" htmlFor="a-family">{familyField.label}</label>
              <select id="a-family" style={{ width: 200 }} value={family ?? ''} onChange={(e) => { setFamily(e.target.value); setStrategyId('none') }}>
                {familyField.options?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </>
          ) : null}
          <label className="small" htmlFor="a-strategy">Attacker</label>
          <select id="a-strategy" style={{ width: 260 }} value={strategy?.id ?? 'none'} disabled={!simProto} onChange={(e) => { setStrategyId(e.target.value as Strategy); setLemmaName(null) }}>
            {(simProto?.strategies ?? [{ id: 'none', label: 'No simulator for this protocol', blurb: '', maps: null }]).map((s) => <option key={s.id} value={s.id}>{s.label}{s.maps ? ` (${s.maps})` : ''}</option>)}
          </select>
          <label className="small" htmlFor="a-lemma">Lemma</label>
          <select id="a-lemma" style={{ width: 230 }} value={lemma?.name ?? ''} onChange={(e) => setLemmaName(e.target.value)}>
            {protocol.lemmas.map((l) => <option key={l.name} value={l.name}>{l.title ?? l.name}</option>)}
          </select>
        </div>
      </div>

      <div className="two-col">
        <section className="panel" aria-labelledby="sim-h">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Simulation</p>
              <h2 id="sim-h">Sampled executions through one entry point</h2>
            </div>
            <div className="row">
              <label className="small" htmlFor="a-noise">noise</label>
              <input id="a-noise" type="number" min={0} max={0.5} step={0.01} style={{ width: 70 }} value={noise} onChange={(e) => setNoise(Math.max(0, Math.min(0.5, Number(e.target.value) || 0)))} />
              <button type="button" className="ghost small" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>{paused ? 'Resume' : 'Pause'}</button>
              <button type="button" className="ghost small" onClick={resetSim}>Reset</button>
            </div>
          </div>
          <p className="help">{strategy?.blurb ?? 'The simulator module is not available for this protocol; the formal side still runs.'}{loaded && !loaded.real ? ' (stub simulator: numbers are illustrative until web/src/sim/index.ts lands)' : ''}</p>
          <div className="stack">
            <StatTiles tiles={tiles} />
            <ExecutionSpace paths={paths} reduced={reduced} fadeMs={FADE_MS} caption="Each shot lights one path. The picture stays mostly grey." counter={counters ? `${fmtInt(counters.shots)} executions sampled` : undefined} />
            <div>
              <h3>Per-trial error rate against the detection threshold</h3>
              <Histogram values={trialQbers} threshold={THRESHOLD} measure={counters?.fidelity != null ? 'infidelity per trial' : 'QBER per trial'} />
            </div>
            {note ? <p className="help">{note}</p> : null}
            <p className="help">Ideal devices with depolarizing noise {Math.round(noise * 100)} %. Sampling finds what it happens to sample; it makes no physical security claim.</p>
          </div>
        </section>

        <section className="panel" aria-labelledby="proof-h">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Formal verification</p>
              <h2 id="proof-h">A test only a proof can pass: every path from this entry point</h2>
            </div>
            <div className="row">
              {runState.running ? (
                <button type="button" className="secondary" onClick={cancel}>Cancel ({Math.round(elapsed)} s)</button>
              ) : (
                <button type="button" onClick={startRun} disabled={app.mode !== 'live'} title={app.mode !== 'live' ? 'Archive mode: live runs are disabled' : `Run Tamarin (limit ${LIVE_TIMEOUT} s)`}>Run Tamarin</button>
              )}
            </div>
          </div>
          <p className="help">Model {protocol.id} · {Object.entries(options).filter(([, v]) => typeof v === 'string').map(([k, v]) => `${k}=${v}`).join(' · ')} · lemma <code>{lemma?.name}</code></p>
          <div className="stack">
            <RunLog lines={runState.log} status={runState.running ? `${runState.status} ${Math.round(elapsed)} s elapsed.` : runState.status} error={runState.error} collapsed={!runState.running} />
            <ProofReplay lemma={lemmaResult} timedOut={result?.timed_out} reduced={reduced} replayKey={runState.replayKey} running={runState.running} elapsed={elapsed} />
            {result ? (
              <VerdictCard lemma={lemmaResult} meta={lemma ?? undefined} seconds={result.seconds} version={result.version} hash={result.hash} timedOut={result.timed_out} source={runState.source} recorded={runState.recorded} label={result.label} attribution={attr?.tag ?? null} />
            ) : null}
            <RecordPicker records={matching} selected={recordId} onPick={pickRecord} title={app.mode === 'live' ? 'Or replay a recorded run' : 'Recorded runs for this configuration'} />
            {result?.lemmas.length && lemmaResult?.trace ? <p className="help">A counterexample trace is attached. Open <a href="#/b">Station B</a> to read it as a message sequence chart.</p> : null}
          </div>
        </section>
      </div>

      <div className="takeaway" aria-live="polite">
        <strong>Takeaway.</strong> {line}{' '}
        <span className="muted">{lemmaResult && lemmaResult.verified && lemmaResult.quantifier !== 'exists-trace' ? 'Every trace the attacker model permits, not the ones we sampled.' : attacksPresent && summary && !summary.detected && lemmaResult && !lemmaResult.verified ? 'The attack the sampler never caught is the trace the prover found.' : ''}</span>
      </div>
    </div>
  )
}
