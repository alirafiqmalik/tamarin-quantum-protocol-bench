import { describe, expect, it } from 'vitest'
import type { TraceEvent } from './api'
import { buildRows, orderLanes, shortTerm } from './lanes'

const ev = (id: string, t: number, lane: string, rule: string, kind: 'rule' | 'attacker' = 'rule'): TraceEvent => ({ id, t, lane, rule, kind, actions: [], violation: false })

describe('lanes', () => {
  it('orders lanes canonically and appends unknown lanes', () => {
    expect(orderLanes(['attacker', 'channel', 'bob', 'zeta', 'alice'])).toEqual(['alice', 'bob', 'channel', 'attacker', 'zeta'])
  })
  it('collapses runs of attacker bookkeeping', () => {
    const events = [ev('a', 0, 'attacker', 'Send', 'attacker'), ev('b', 1, 'attacker', 'Coerce', 'attacker'), ev('c', 2, 'alice', 'Alice_Send_BA'), ev('d', 3, 'attacker', 'Constrc_pair', 'attacker')]
    const open = buildRows(events, false)
    expect(open.rows).toHaveLength(4)
    const folded = buildRows(events, true)
    expect(folded.rows).toHaveLength(3)
    expect(folded.rows[0].collapsed).toBe(true)
    expect(folded.rows[0].events.map((e) => e.id)).toEqual(['a', 'b'])
    expect(folded.rowOf.get('b')).toBe(0)
    expect(folded.rowOf.get('c')).toBe(1)
  })
  it('shortens terms', () => {
    expect(shortTerm('Send_BA( A, B, BA(~ba) )', 12)).toBe('Send_BA( A,…')
  })
})
