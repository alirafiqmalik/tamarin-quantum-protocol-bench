import type { Standard } from '../lib/api'

export function StandardsStrip({ standards }: { standards: Standard[] }) {
  if (!standards.length) return null
  return (
    <section className="panel">
      <p className="eyebrow">What the standard says</p>
      <div className="standards">
        {standards.map((s) => (
          <div key={s.clause} className="standard">
            <div className="clause">{s.clause}</div>
            <div>{s.text}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
