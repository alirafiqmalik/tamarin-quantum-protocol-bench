import { useMemo } from 'react'
import { useTooltip } from './Tooltip'
import { fmtPct } from '../lib/format'

export interface HistogramProps {
  /** Values in 0..1 (per-trial error rate). */
  values: number[]
  threshold: number
  /** Axis label. */
  measure?: string
  bins?: number
  max?: number
}

/**
 * Per-trial error-rate histogram against the detection threshold. Single series,
 * one hue; the threshold is a labeled rule, not a second series.
 */
export function Histogram({ values, threshold, measure = 'QBER per trial', bins = 25, max = 0.5 }: HistogramProps) {
  const tip = useTooltip()
  const counts = useMemo(() => {
    const c = new Array<number>(bins).fill(0)
    for (const v of values) {
      const i = Math.min(bins - 1, Math.max(0, Math.floor((v / max) * bins)))
      c[i] += 1
    }
    return c
  }, [values, bins, max])
  const peak = Math.max(1, ...counts)
  const W = 520
  const H = 170
  const padL = 34
  const padR = 8
  const padT = 10
  const padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const barW = plotW / bins
  const tx = padL + (threshold / max) * plotW
  const ticks = [0, 0.1, 0.2, 0.3, 0.4, 0.5].filter((t) => t <= max)
  const yTicks = [0, Math.ceil(peak / 2), peak]
  const n = values.length
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0
  const above = values.filter((v) => v > threshold).length

  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${measure} histogram, ${n} trials`}>
        {yTicks.map((t) => {
          const y = padT + plotH - (t / peak) * plotH
          return (
            <g key={t}>
              <line className="grid" x1={padL} x2={W - padR} y1={y} y2={y} />
              <text x={padL - 6} y={y + 4} fontSize={10} textAnchor="end">{t}</text>
            </g>
          )
        })}
        <line className="axis" x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} />
        {counts.map((c, i) => {
          if (!c) return null
          const bh = (c / peak) * plotH
          const x = padL + i * barW + 1
          const y = padT + plotH - bh
          const lo = (i / bins) * max
          const hi = ((i + 1) / bins) * max
          const content = (
            <>
              <strong>{c} trial{c === 1 ? '' : 's'}</strong>
              {`\n${measure} ${fmtPct(lo, 0)} to ${fmtPct(hi, 0)}`}
            </>
          )
          return (
            <g key={i} tabIndex={0} onPointerMove={(e) => tip.show(e, content)} onPointerLeave={tip.hide} onFocus={(e) => tip.show(e, content)} onBlur={tip.hide}>
              <rect x={x - 1} y={padT} width={barW} height={plotH} fill="transparent" />
              <path d={roundedTop(x, y, Math.max(1, barW - 2), bh, 3)} fill="#5c564c" />
            </g>
          )
        })}
        {ticks.map((t) => (
          <text key={t} x={padL + (t / max) * plotW} y={H - 8} fontSize={10} textAnchor="middle">{Math.round(t * 100)}%</text>
        ))}
        <line x1={tx} x2={tx} y1={padT} y2={padT + plotH} stroke="#9a3412" strokeWidth={1.5} />
        <text x={tx + 4} y={padT + 10} fontSize={10} fill="#9a3412" style={{ fill: '#9a3412' }}>threshold {Math.round(threshold * 100)} %</text>
        <text x={W - padR} y={H - 8} fontSize={10} textAnchor="end">{measure}</text>
      </svg>
      <div className="legend" aria-live="polite">
        <span>{n} trials</span>
        <span>mean {fmtPct(mean)}</span>
        <span>{above} above threshold</span>
      </div>
      {tip.node}
    </div>
  )
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h)
  return `M${x} ${y + h}V${y + rr}Q${x} ${y} ${x + rr} ${y}H${x + w - rr}Q${x + w} ${y} ${x + w} ${y + rr}V${y + h}Z`
}
