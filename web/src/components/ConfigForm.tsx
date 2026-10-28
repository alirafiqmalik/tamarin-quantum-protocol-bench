import type { Field, Options } from '../lib/api'

export interface ConfigFormProps {
  fields: Field[]
  value: Options
  onChange: (next: Options) => void
  idPrefix?: string
  disabled?: boolean
}

export function defaultOptions(fields: Field[]): Options {
  const out: Options = {}
  for (const f of fields) out[f.key] = f.kind === 'bool' ? Boolean(f.default) : String(f.default ?? f.options?.[0]?.id ?? '')
  return out
}

/** Form generated from catalog fields: choice -> select, bool -> switch. */
export function ConfigForm({ fields, value, onChange, idPrefix = 'cfg', disabled = false }: ConfigFormProps) {
  const choices = fields.filter((f) => f.kind === 'choice')
  const bools = fields.filter((f) => f.kind === 'bool')
  return (
    <div>
      <div className="inline-fields">
        {choices.map((f) => (
          <div key={f.key}>
            <label className="field" htmlFor={`${idPrefix}-${f.key}`}>{f.label}</label>
            <select id={`${idPrefix}-${f.key}`} value={String(value[f.key] ?? '')} disabled={disabled} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}>
              {(f.options ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {bools.map((f) => (
        <label key={f.key} className="bool-row" htmlFor={`${idPrefix}-${f.key}`}>
          <input id={`${idPrefix}-${f.key}`} type="checkbox" role="switch" aria-checked={Boolean(value[f.key])} checked={Boolean(value[f.key])} disabled={disabled} onChange={(e) => onChange({ ...value, [f.key]: e.target.checked })} />
          {f.label}
        </label>
      ))}
    </div>
  )
}
