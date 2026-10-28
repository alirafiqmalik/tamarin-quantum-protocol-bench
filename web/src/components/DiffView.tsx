import { useMemo } from 'react'
import { changedRules, classifyDiff, diffStats } from '../lib/diff'

export function DiffView({ a, b, lines }: { a: string; b: string; lines: string[] }) {
  const classified = useMemo(() => classifyDiff(lines), [lines])
  const stats = diffStats(classified)
  const rules = changedRules(classified)
  if (!lines.length) return <p className="help">No difference between {a} and {b}.</p>
  return (
    <div>
      <p className="help">
        {a} → {b}: +{stats.added} −{stats.removed} in {stats.hunks} hunk{stats.hunks === 1 ? '' : 's'}
        {rules.length ? <>. Rules changed: {rules.map((r) => <code key={r}>{r} </code>)}</> : null}
      </p>
      <pre className="diff" aria-label="Unified diff">
        {classified.map((l, i) => (
          <div key={i} className={l.kind}>{l.text || ' '}</div>
        ))}
      </pre>
    </div>
  )
}
