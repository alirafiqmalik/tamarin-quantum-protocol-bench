import type { Options, Preset } from '../lib/api'
import { optionsMatch } from '../lib/format'

export function Presets({ presets, value, onPick }: { presets: Preset[]; value: Options; onPick: (p: Preset) => void }) {
  if (!presets.length) return null
  return (
    <div className="presets" role="group" aria-label="Presets">
      {presets.map((p) => {
        const active = optionsMatch(p.options, value, Object.keys(p.options))
        return (
          <button key={p.id} type="button" className="preset" aria-pressed={active} onClick={() => onPick(p)}>
            <div className="title">{p.label}</div>
            {p.story ? <div className="story">{p.story}</div> : null}
          </button>
        )
      })}
    </div>
  )
}
