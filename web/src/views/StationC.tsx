import { useCallback, useMemo, useState } from 'react'
import { loadRecord, type EvidenceRecord, type EvidenceSummary } from '../lib/api'
import { useApp } from '../lib/context'
import { attribution, buildMatrix, cellState, paperAgreement, type CellState } from '../lib/evidence'
import { fmtSeconds, fmtTime } from '../lib/format'
import { useReducedMotion } from '../lib/hooks'
import { recordToResult } from '../lib/run'
import { Modal } from '../components/Modal'
import { ProofReplay } from '../components/ProofReplay'
import { SequenceChart } from '../components/SequenceChart'
import { VerdictCard } from '../components/VerdictCard'

const GLYPH: Record<CellState, string> = { verified: '✓', falsified: '✕', timeout: '?', inconclusive: '?', none: '·' }
const TITLE: Record<CellState, string> = { verified: 'verified', falsified: 'falsified (counterexample)', timeout: 'timeout, inconclusive', inconclusive: 'inconclusive', none: 'not run' }

export function StationC() {
  const app = useApp()
  const reduced = useReducedMotion()
  const records = useMemo(() => Object.values(app.evidence.records), [app.evidence])
  const groups = useMemo(() => buildMatrix(records, app.catalog.protocols), [records, app.catalog.protocols])
  const [open, setOpen] = useState<{ summary: EvidenceSummary; record: EvidenceRecord | null; error: string | null } | null>(null)
  const env = app.evidence.environment ?? app.environment

  const openCell = async (summary: EvidenceSummary) => {
    setOpen({ summary, record: null, error: null })
    try {
      const record = await loadRecord(app.mode, summary)
      setOpen((o) => (o && o.summary.id === summary.id ? { ...o, record } : o))
    } catch (err) {
      setOpen((o) => (o && o.summary.id === summary.id ? { ...o, error: err instanceof Error ? err.message : String(err) } : o))
    }
  }
  const close = useCallback(() => setOpen(null), [])

  const download = () => {
    const blob = new Blob([JSON.stringify(app.evidence, null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `evidence-manifest-${(app.evidence.updated ?? 'snapshot').replace(/[:]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const counts = records.reduce<Record<CellState, number>>((acc, r) => { acc[cellState(r)] += 1; return acc }, { verified: 0, falsified: 0, timeout: 0, inconclusive: 0, none: 0 })

  return (
    <div>
      <div className="spread">
        <div>
          <p className="eyebrow">Station C</p>
          <h1 style={{ fontSize: 26 }}>Evidence matrix</h1>
        </div>
        <button type="button" className="secondary" onClick={download} disabled={!records.length}>Download manifest (JSON)</button>
      </div>
      <p className="lead muted">Every cell is one recorded Tamarin run from <code>python3 -m bench.batch</code>: model hash, m4 options, heuristic, time, verdict, proof tree and trace. Timeouts are inconclusive, not verdicts.</p>

      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 24 }}>
          <span className="small"><span className="muted">Tamarin</span> <strong>{env.tamarin ?? '–'}</strong></span>
          <span className="small"><span className="muted">CPUs</span> <strong>{env.cpus ?? '–'}</strong></span>
          <span className="small"><span className="muted">Platform</span> <strong>{env.platform ?? '–'}</strong></span>
          <span className="small"><span className="muted">Updated</span> <strong>{fmtTime(app.evidence.updated)}</strong></span>
          <span className="small"><span className="muted">Records</span> <strong>{records.length}</strong> ({counts.verified} verified, {counts.falsified} falsified, {counts.timeout + counts.inconclusive} inconclusive)</span>
          <span className={`pill ${app.mode === 'live' ? 'live' : 'cached'}`}>{app.mode === 'live' ? 'served by app.py' : 'archive snapshot'}</span>
        </div>
      </section>

      {!groups.length ? <p className="help">No evidence yet. Run <code>python3 -m bench.batch</code> to populate <code>evidence/</code>.</p> : null}
      {groups.map((g) => {
        const protocol = app.catalog.protocols.find((p) => p.id === g.protocol)
        return (
          <section key={g.protocol} className="panel" style={{ marginBottom: 14, overflowX: 'auto' }}>
            <div className="panel-head">
              <h2>{protocol?.name ?? g.protocol}</h2>
              <span className="small muted">{g.rows.length} configuration{g.rows.length === 1 ? '' : 's'} × {g.lemmas.length} lemma{g.lemmas.length === 1 ? '' : 's'}</span>
            </div>
            <table className="matrix">
              <thead>
                <tr>
                  <th scope="col">Configuration</th>
                  {g.lemmas.map((l) => <th key={l} scope="col" className="lemma" title={protocol?.lemmas.find((m) => m.name === l)?.title}>{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {g.rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {g.lemmas.map((l) => {
                      const r = row.cells[l]
                      const st = cellState(r)
                      const attr = attribution(r, protocol)
                      const paper = paperAgreement(r, protocol)
                      const paperText = paper === 'disagrees' ? ' · differs from the paper' : paper === 'agrees' ? ' · as in the paper' : ''
                      return (
                        <td key={l} className="cell">
                          <button type="button" className={`cell-btn ${st}`} disabled={!r} onClick={() => r && void openCell(r)} title={r ? `${TITLE[st]}${st === 'inconclusive' ? ` (${r.status})` : ''} · ${r.steps ?? '?'} steps · ${fmtSeconds(r.seconds)} · ${r.recorded}${attr ? ` · ${attr.tag} (${attr.source})` : ''}${paperText}` : 'not run'} aria-label={`${row.label}, ${l}: ${TITLE[st]}${attr ? `, ${attr.tag}` : ''}${paperText}`}>
                            <span aria-hidden="true">{GLYPH[st]}</span>
                            {attr ? <span className="attr">{attr.tag}</span> : null}
                            {paper === 'disagrees' ? <span className="attr" title="Differs from the paper's verdict">≠paper</span> : null}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
      <div className="legend">
        <span className="key"><span className="swatch" style={{ background: 'var(--hold-soft)' }} /> ✓ verified</span>
        <span className="key"><span className="swatch" style={{ background: 'var(--fail-soft)' }} /> ✕ falsified, with V1/V2/V3 attribution when known</span>
        <span className="key"><span className="swatch" style={{ background: 'var(--wait-soft)' }} /> ? timeout (inconclusive)</span>
        <span className="key"><span className="swatch" style={{ background: 'var(--grey-soft)' }} /> · not run</span>
      </div>

      {open ? (
        <Modal title={`${open.summary.label} · ${open.summary.lemma}`} onClose={close}>
          <RecordView summary={open.summary} record={open.record} error={open.error} reduced={reduced} />
        </Modal>
      ) : null}
    </div>
  )
}

function RecordView({ summary, record, error, reduced }: { summary: EvidenceSummary; record: EvidenceRecord | null; error: string | null; reduced: boolean }) {
  const app = useApp()
  const protocol = app.catalog.protocols.find((p) => p.id === summary.protocol)
  const attr = attribution(summary, protocol)
  if (error) return <p className="status-line error">{error}</p>
  if (!record) return <p className="help">Loading the record.</p>
  const result = recordToResult(record)
  const lemma = result.lemmas[0] ?? null
  return (
    <div className="stack">
      <VerdictCard lemma={lemma} meta={protocol?.lemmas.find((l) => l.name === summary.lemma)} seconds={record.seconds} version={record.version} hash={record.hash} timedOut={record.timed_out} source="cached" recorded={record.recorded} label={record.label} attribution={attr?.tag ?? null} />
      <p className="small muted">Heuristic {record.heuristic} · options {Object.entries(record.options).map(([k, v]) => `${k}=${String(v)}`).join(' ')}{record.theory_file ? ` · ${record.theory_file}` : ''}</p>
      <div className="two-col">
        <section className="panel">
          <p className="eyebrow">Proof replay</p>
          <ProofReplay lemma={lemma} timedOut={record.timed_out} reduced={reduced} replayKey={`c-${record.id}`} />
        </section>
        <section className="panel">
          <p className="eyebrow">Trace</p>
          {lemma?.trace ? <SequenceChart trace={lemma.trace} /> : <p className="help">{record.timed_out ? 'Timed out: no trace.' : 'No trace for this record (verified all-traces lemma or no proof).'}</p>}
        </section>
      </div>
      {record.log ? <details><summary className="small">Tamarin log tail</summary><pre className="log">{record.log}</pre></details> : null}
    </div>
  )
}
