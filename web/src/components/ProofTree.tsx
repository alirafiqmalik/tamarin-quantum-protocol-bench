import { useMemo } from 'react'
import { motion } from 'motion/react'
import type { Proof } from '../lib/api'
import { layoutTree, nodeTone } from '../lib/tree'
import { useTooltip } from './Tooltip'

const TONE: Record<string, string> = { closed: '#0f6e56', trace: '#9a3412', open: '#8a5a12', neutral: '#5c564c' }

export interface ProofTreeProps {
  proof: Proof
  /** Number of nodes revealed so far. */
  shown: number
  outcome: 'verified' | 'falsified' | 'other'
  reduced: boolean
  height?: number
}

/** Layered proof tree: nodes appear in proof.order; green = closed, red leaf = trace found. */
export function ProofTree({ proof, shown, outcome, reduced, height = 190 }: ProofTreeProps) {
  const layout = useMemo(() => layoutTree(proof.order), [proof])
  const tip = useTooltip()
  const W = 520
  const H = height
  const pad = 14
  const px = (x: number) => pad + x * (W - 2 * pad)
  const py = (y: number) => pad + y * (H - 2 * pad)
  const visible = new Set(layout.nodes.slice(0, shown).map((n) => n.i))
  const pos = new Map(layout.nodes.map((n) => [n.i, n]))
  const lastLeaf = outcome === 'falsified' ? [...layout.nodes].reverse().find((n) => n.leaf) : undefined
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Proof tree, ${proof.size} nodes, depth ${proof.depth}`}>
        {layout.edges.map(([p, c]) => {
          if (!visible.has(c)) return null
          const a = pos.get(p)
          const b = pos.get(c)
          if (!a || !b) return null
          const tone = nodeTone(b, outcome, b.leaf)
          const stroke = lastLeaf && b.i === lastLeaf.i ? TONE.trace : tone === 'closed' ? TONE.closed : '#d9d1c3'
          return <line key={`${p}-${c}`} x1={px(a.x)} y1={py(a.y)} x2={px(b.x)} y2={py(b.y)} stroke={stroke} strokeWidth={1.5} />
        })}
        {layout.nodes.map((n) => {
          if (!visible.has(n.i)) return null
          const isTrace = lastLeaf && n.i === lastLeaf.i
          const tone = isTrace ? 'trace' : nodeTone(n, outcome, n.leaf)
          const fill = TONE[tone]
          const r = isTrace ? 6 : n.leaf ? 4.5 : 3.5
          const content = (
            <>
              <strong>{n.kind}{n.label ? `: ${n.label}` : ''}</strong>
              {`\n#${n.i} depth ${n.d} · ${n.status}`}
            </>
          )
          const common = {
            cx: px(n.x), cy: py(n.y), r, fill, stroke: '#fffdf8', strokeWidth: 1.5, tabIndex: 0,
            onPointerMove: (e: React.PointerEvent) => tip.show(e, content), onPointerLeave: tip.hide,
            onFocus: (e: React.FocusEvent) => tip.show(e, content), onBlur: tip.hide,
          }
          return reduced ? <circle key={n.i} {...common} /> : <motion.circle key={n.i} {...common} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.25 }} style={{ transformOrigin: `${px(n.x)}px ${py(n.y)}px` }} />
        })}
      </svg>
      <div className="legend">
        <span className="key"><span className="swatch" style={{ background: TONE.closed }} /> closed / contradiction</span>
        <span className="key"><span className="swatch" style={{ background: TONE.trace }} /> trace found (counterexample)</span>
        <span className="key"><span className="swatch" style={{ background: TONE.open }} /> open (unfinished)</span>
        <span className="key"><span className="swatch" style={{ background: TONE.neutral }} /> case split</span>
        <span>{Math.min(shown, proof.order.length)} / {proof.order.length} nodes</span>
      </div>
      {tip.node}
    </div>
  )
}
