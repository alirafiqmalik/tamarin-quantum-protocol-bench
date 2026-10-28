import type { EvidenceSummary } from '../lib/api'
import { cellState } from '../lib/evidence'
import { fmtSeconds } from '../lib/format'

export function RecordPicker({ records, selected, onPick, title = 'Recorded runs' }: { records: EvidenceSummary[]; selected: string | null; onPick: (r: EvidenceSummary) => void; title?: string }) {
  if (!records.length) return <p className="help">No recorded run matches this configuration.</p>
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <div className="records" role="listbox" aria-label={title}>
        {records.map((r) => {
          const st = cellState(r)
          return (
            <button key={r.id} type="button" className="record-btn" role="option" aria-selected={selected === r.id} aria-pressed={selected === r.id} onClick={() => onPick(r)}>
              <span><code>{r.lemma}</code> · {r.label}</span>
              <span className={`st ${st}`}>{st}{r.steps != null ? ` · ${r.steps} steps` : ''} · {fmtSeconds(r.seconds)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
