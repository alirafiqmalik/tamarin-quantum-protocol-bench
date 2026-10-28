/** Sequence-chart lane ordering and attacker bookkeeping collapse. Pure helpers. */
import type { TraceEvent, TraceMessage } from './api'

export const LANE_ORDER = ['alice', 'bob', 'charlie', 'dealer', 'kme_a', 'kme_b', 'eve', 'channel', 'network', 'attacker'] as const

export const LANE_LABELS: Record<string, string> = {
  alice: 'Alice',
  bob: 'Bob',
  charlie: 'Charlie',
  dealer: 'Dealer',
  kme_a: 'KME A',
  kme_b: 'KME B',
  eve: 'Eve',
  channel: 'Channel',
  network: 'Network',
  attacker: 'Attacker',
}

/** Order lanes by the canonical list; unknown lanes keep their relative order at the end. */
export function orderLanes(lanes: string[]): string[] {
  const rank = new Map<string, number>(LANE_ORDER.map((l, i) => [l, i]))
  const known = lanes.filter((l) => rank.has(l)).sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
  const unknown = lanes.filter((l) => !rank.has(l))
  return [...new Set([...known, ...unknown])]
}

export function laneLabel(lane: string): string {
  return LANE_LABELS[lane] ?? lane.charAt(0).toUpperCase() + lane.slice(1)
}

/** Attacker bookkeeping: intruder deduction rules that carry no protocol meaning. */
const BOOKKEEPING = /^(Coerce|Constrc_|Destrd_|Recv$|Send$|isend|irecv|pub|fresh)/i

export function isBookkeeping(ev: TraceEvent): boolean {
  return ev.kind === 'attacker' && BOOKKEEPING.test(ev.rule) && !ev.violation
}

export interface ChartRow {
  index: number
  /** Trace time of the first event in this row. */
  t: number
  events: TraceEvent[]
  collapsed: boolean
}

/**
 * Build the rows of the chart. Each event is its own row, unless `collapse` is
 * set, in which case runs of consecutive attacker bookkeeping events fold into
 * one compact row. Returns rows and a map event id -> row index.
 */
export function buildRows(events: TraceEvent[], collapse: boolean): { rows: ChartRow[]; rowOf: Map<string, number> } {
  const sorted = [...events].sort((a, b) => a.t - b.t)
  const rows: ChartRow[] = []
  const rowOf = new Map<string, number>()
  for (const ev of sorted) {
    const last = rows[rows.length - 1]
    if (collapse && isBookkeeping(ev) && last && last.collapsed) {
      last.events.push(ev)
      rowOf.set(ev.id, last.index)
      continue
    }
    const row: ChartRow = { index: rows.length, t: ev.t, events: [ev], collapsed: collapse && isBookkeeping(ev) }
    rows.push(row)
    rowOf.set(ev.id, row.index)
  }
  return { rows, rowOf }
}

export const CHANNEL_LABELS: Record<string, string> = {
  quantum: 'quantum',
  'classical-auth': 'authenticated classical',
  public: 'public',
  state: 'state',
}

/** Messages whose endpoints are both known events. */
export function routableMessages(messages: TraceMessage[], rowOf: Map<string, number>): TraceMessage[] {
  return messages.filter((m) => rowOf.has(m.from) && rowOf.has(m.to))
}

/** Shorten a Tamarin term for a chart label. */
export function shortTerm(term: string, max = 28): string {
  const flat = term.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  return flat.slice(0, max - 1) + '…'
}
