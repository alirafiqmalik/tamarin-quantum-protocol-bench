/** Shared state machine for a verification run: live stream or cached record. */
import { useCallback, useRef, useState } from 'react'
import { loadRecord, verifyStream, type EvidenceRecord, type EvidenceSummary, type Mode, type VerifyRequest, type VerifyResult } from './api'

export interface RunState {
  running: boolean
  startedAt: number | null
  status: string
  error: string | null
  log: string[]
  result: VerifyResult | null
  source: 'live' | 'cached' | 'pending'
  recorded?: string
  /** Changes on every new result, to restart replays. */
  replayKey: string
}

const initial: RunState = { running: false, startedAt: null, status: '', error: null, log: [], result: null, source: 'pending', replayKey: '0' }

/** Convert an evidence record into the result shape the views render. */
export function recordToResult(rec: EvidenceRecord): VerifyResult {
  return {
    key: rec.id,
    label: rec.label,
    heuristic: rec.heuristic,
    lemma: rec.lemma,
    version: rec.version ?? '',
    hash: rec.hash,
    seconds: rec.seconds,
    wall: rec.wall ?? null,
    timed_out: rec.timed_out,
    cached: true,
    log: rec.log,
    lemmas: rec.timed_out && !rec.proof && !rec.trace && !rec.steps ? [] : [{
      name: rec.lemma,
      quantifier: rec.quantifier ?? 'all-traces',
      status: rec.status,
      verified: rec.verified,
      steps: rec.steps,
      proof: rec.proof ?? null,
      trace: rec.trace ?? null,
    }],
  }
}

export function useRun(mode: Mode) {
  const [state, setState] = useState<RunState>(initial)
  const abort = useRef<AbortController | null>(null)
  const seq = useRef(0)

  const run = useCallback(async (req: VerifyRequest) => {
    if (mode !== 'live') {
      setState((s) => ({ ...s, error: 'Live verification is unavailable in archive mode. Pick a recorded run instead.' }))
      return
    }
    abort.current?.abort()
    const ctl = new AbortController()
    abort.current = ctl
    seq.current += 1
    const my = seq.current
    setState({ ...initial, running: true, startedAt: Date.now(), status: 'Contacting the server.', source: 'live', replayKey: `live-${my}` })
    try {
      const result = await verifyStream(req, {
        onStatus: (st) => setState((s) => ({ ...s, status: `Running Tamarin on ${st.label} (limit ${st.timeout} s).` })),
        onLog: (line) => setState((s) => ({ ...s, log: [...s.log.slice(-200), line] })),
      }, ctl.signal)
      if (seq.current !== my) return
      setState((s) => ({ ...s, running: false, result, source: result.cached ? 'cached' : 'live', status: result.timed_out ? 'Tamarin hit the time limit. Inconclusive.' : result.cached ? `Server cache hit from a ${result.seconds ?? '?'} s run.` : `Finished in ${result.seconds ?? '?'} s.`, replayKey: `live-${my}-done` }))
    } catch (err) {
      if (seq.current !== my) return
      const message = err instanceof Error ? err.message : String(err)
      setState((s) => ({ ...s, running: false, error: ctl.signal.aborted ? 'Run cancelled.' : message, status: '' }))
    }
  }, [mode])

  const cancel = useCallback(() => abort.current?.abort(), [])

  const replayRecord = useCallback(async (summary: EvidenceSummary) => {
    seq.current += 1
    const my = seq.current
    setState({ ...initial, status: 'Loading the recorded run.', source: 'cached' })
    try {
      const rec = await loadRecord(mode, summary)
      if (seq.current !== my) return
      setState({ ...initial, result: recordToResult(rec), source: 'cached', recorded: rec.recorded, status: `Recorded ${rec.recorded} with Tamarin ${rec.version ?? '?'}.`, replayKey: `rec-${rec.id}-${my}` })
    } catch (err) {
      if (seq.current !== my) return
      setState({ ...initial, error: err instanceof Error ? err.message : String(err) })
    }
  }, [mode])

  const reset = useCallback(() => {
    abort.current?.abort()
    seq.current += 1
    setState(initial)
  }, [])

  return { state, run, cancel, replayRecord, reset }
}
