export interface Tile {
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'bad' | 'warn' | 'neutral'
}

/** KPI row of stat tiles: value leads, label follows, no chart. */
export function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="tiles" role="list">
      {tiles.map((t) => (
        <div key={t.label} className={`tile ${t.tone && t.tone !== 'neutral' ? t.tone : ''}`} role="listitem">
          <div className="label">{t.label}</div>
          <div className="value">{t.value}</div>
          {t.sub ? <div className="sub">{t.sub}</div> : null}
        </div>
      ))}
    </div>
  )
}
