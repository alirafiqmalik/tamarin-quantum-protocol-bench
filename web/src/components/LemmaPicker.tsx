import type { LemmaMeta } from '../lib/api'

export function LemmaPicker({ lemmas, value, onChange, enabled }: { lemmas: LemmaMeta[]; value: string | null; onChange: (name: string) => void; enabled?: (l: LemmaMeta) => boolean }) {
  return (
    <div className="lemma-list" role="radiogroup" aria-label="Lemma">
      {lemmas.map((l) => {
        const on = enabled ? enabled(l) : true
        return (
          <button key={l.name} type="button" role="radio" aria-checked={value === l.name} aria-pressed={value === l.name} className="lemma-btn" disabled={!on} title={on ? undefined : 'Enable the matching lemma switch in the configuration'} onClick={() => onChange(l.name)}>
            <div className="t">{l.title ?? l.name} <span className="n">{l.name} · {l.kind}</span></div>
            {l.desc ? <div className="d">{l.desc}</div> : null}
          </button>
        )
      })}
    </div>
  )
}
