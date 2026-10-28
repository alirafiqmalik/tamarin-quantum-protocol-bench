import { useMemo, useState } from 'react'
import type { Trace } from '../lib/api'
import { buildRows, CHANNEL_LABELS, laneLabel, orderLanes, routableMessages, shortTerm } from '../lib/lanes'
import { useTooltip } from './Tooltip'

export interface SequenceChartProps {
  trace: Trace
  /** Initial state of the bookkeeping toggle. */
  collapseDefault?: boolean
}

const LANE_W = 190
const ROW_H = 44
const TOP = 46
const BOX_W = 150
const BOX_H = 30

/**
 * Message sequence chart from a Tamarin trace: lanes as vertical lifelines,
 * events as boxes at y = row, messages as arrows colored by channel. Hover or
 * focus shows the full term. Violation events are highlighted.
 */
export function SequenceChart({ trace, collapseDefault = true }: SequenceChartProps) {
  const [collapse, setCollapse] = useState(collapseDefault)
  const tip = useTooltip()
  const lanes = useMemo(() => orderLanes(trace.lanes), [trace.lanes])
  const { rows, rowOf } = useMemo(() => buildRows(trace.events, collapse), [trace.events, collapse])
  const messages = useMemo(() => routableMessages(trace.messages, rowOf), [trace.messages, rowOf])
  const laneX = new Map(lanes.map((l, i) => [l, LANE_W / 2 + i * LANE_W]))
  const W = Math.max(1, lanes.length) * LANE_W
  const H = TOP + rows.length * ROW_H + 24
  const rowY = (r: number) => TOP + r * ROW_H + ROW_H / 2
  const violationSet = new Set(trace.violation)
  const eventById = new Map(trace.events.map((e) => [e.id, e]))
  const hidden = trace.events.length - rows.reduce((n, r) => n + (r.collapsed ? 0 : r.events.length), 0)

  return (
    <div>
      <div className="spread" style={{ marginBottom: 6 }}>
        <div className="legend" aria-label="Channel legend">
          <span className="key"><span className="line-key" style={{ borderColor: 'var(--quantum)' }} /> quantum</span>
          <span className="key"><span className="line-key" style={{ borderColor: 'var(--auth)' }} /> authenticated classical</span>
          <span className="key"><span className="line-key" style={{ borderColor: 'var(--public)' }} /> public</span>
          <span className="key"><span className="line-key dotted" style={{ borderColor: 'var(--state)' }} /> state</span>
          <span className="key"><span className="swatch" style={{ background: 'var(--fail-soft)', border: '1px solid var(--fail)' }} /> violation</span>
        </div>
        <label className="switch">
          <input type="checkbox" checked={collapse} onChange={(e) => setCollapse(e.target.checked)} />
          hide attacker bookkeeping{collapse && hidden > 0 ? ` (${hidden} folded)` : ''}
        </label>
      </div>
      <div className="seq">
        <svg width={W} height={H} role="img" aria-label={`Message sequence chart with ${trace.events.length} events and ${trace.messages.length} messages`}>
          <defs>
            {['quantum', 'classical-auth', 'public', 'state'].map((ch) => (
              <marker key={ch} id={`arrow-${ch}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                {ch === 'quantum' ? (
                  <circle cx="5" cy="5" r="3.5" fill="var(--quantum)" />
                ) : ch === 'public' ? (
                  <path d="M1 1L9 5L1 9z" fill="none" stroke="var(--public)" strokeWidth="1.5" />
                ) : (
                  <path d="M0 0L10 5L0 10z" fill={`var(--${ch === 'classical-auth' ? 'auth' : 'state'})`} />
                )}
              </marker>
            ))}
          </defs>
          {lanes.map((l) => {
            const x = laneX.get(l) ?? 0
            return (
              <g key={l}>
                <text className="lane-title" x={x} y={22} textAnchor="middle">{laneLabel(l)}</text>
                <line className="lifeline" x1={x} x2={x} y1={32} y2={H - 8} />
              </g>
            )
          })}
          {messages.map((m, k) => {
            const r1 = rowOf.get(m.from) ?? 0
            const r2 = rowOf.get(m.to) ?? 0
            const x1 = laneX.get(m.fromLane) ?? 0
            const x2 = laneX.get(m.toLane) ?? 0
            const y1 = rowY(r1)
            const y2 = rowY(r2)
            const same = x1 === x2
            const ch = CHANNEL_LABELS[m.channel] ? m.channel : 'public'
            const d = same ? `M${x1 + BOX_W / 2} ${y1}C${x1 + BOX_W / 2 + 40} ${y1} ${x2 + BOX_W / 2 + 40} ${y2} ${x2 + BOX_W / 2} ${y2}` : `M${x1 + (x2 > x1 ? BOX_W / 2 : -BOX_W / 2)} ${y1}L${x2 + (x2 > x1 ? -BOX_W / 2 : BOX_W / 2)} ${y2}`
            const content = (
              <>
                <strong>{m.fact}</strong>
                {`\n${CHANNEL_LABELS[m.channel] ?? m.channel} · ${m.relation}\n${m.full}`}
              </>
            )
            const midX = (x1 + x2) / 2
            const midY = (y1 + y2) / 2
            return (
              <g key={k}>
                <path className="msg-hit" d={d} tabIndex={0} onPointerMove={(e) => tip.show(e, content)} onPointerLeave={tip.hide} onFocus={(e) => tip.show(e, content)} onBlur={tip.hide} />
                <path className={`msg ${ch}`} d={d} markerEnd={`url(#arrow-${ch})`} />
                {!same ? <text className="msg-label" x={midX} y={midY - 4} textAnchor="middle">{shortTerm(m.label, 26)}</text> : null}
              </g>
            )
          })}
          {rows.map((row) => {
            const y = rowY(row.index)
            if (row.collapsed) {
              const x = laneX.get('attacker') ?? laneX.get(row.events[0].lane) ?? 0
              const content = <>{row.events.map((e) => `${e.rule}: ${e.actions.join(' ; ')}`).join('\n')}</>
              return (
                <g key={row.index} className="ev collapsed" tabIndex={0} onPointerMove={(e) => tip.show(e, content)} onPointerLeave={tip.hide} onFocus={(e) => tip.show(e, content)} onBlur={tip.hide}>
                  <rect x={x - BOX_W / 2} y={y - 10} width={BOX_W} height={20} rx={3} />
                  <text x={x} y={y + 4} textAnchor="middle" className="act">{row.events.length} attacker bookkeeping step{row.events.length === 1 ? '' : 's'}</text>
                </g>
              )
            }
            const ev = row.events[0]
            const x = laneX.get(ev.lane) ?? 0
            const violated = ev.violation || violationSet.has(ev.id)
            const content = (
              <>
                <strong>{ev.rule}</strong>
                {`\n${ev.id} · t=${ev.t} · ${ev.lane}${violated ? ' · VIOLATION' : ''}\n${ev.actions.join('\n')}`}
              </>
            )
            return (
              <g key={row.index} className={`ev ${ev.kind === 'attacker' ? 'attacker' : ''} ${violated ? 'violation' : ''}`} tabIndex={0} onPointerMove={(e) => tip.show(e, content)} onPointerLeave={tip.hide} onFocus={(e) => tip.show(e, content)} onBlur={tip.hide}>
                <rect x={x - BOX_W / 2} y={y - BOX_H / 2} width={BOX_W} height={BOX_H} rx={3} />
                <text className="rule" x={x} y={y - 2} textAnchor="middle">{shortTerm(ev.rule, 24)}</text>
                <text className="act" x={x} y={y + 10} textAnchor="middle">{ev.actions[0] ? shortTerm(ev.actions[0], 26) : ''}</text>
                {violated ? <text className="violation-tag" x={x + BOX_W / 2 + 6} y={y + 4}>property breaks here</text> : null}
              </g>
            )
          })}
        </svg>
      </div>
      {trace.violation.length ? (
        <p className="help">Violation at {trace.violation.map((id) => `${id}${eventById.get(id) ? ` (${eventById.get(id)?.rule})` : ''}`).join(', ')}. Rows run top to bottom in trace order; time index t is from the Tamarin JSON.</p>
      ) : null}
      {tip.node}
    </div>
  )
}
