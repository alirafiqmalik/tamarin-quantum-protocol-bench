import { describe, expect, it } from 'vitest'
import type { EvidenceSummary, Protocol } from './api'
import { attribution, buildMatrix, cellState, cmTag, findRecords, paperAgreement } from './evidence'

const rec = (over: Partial<EvidenceSummary>): EvidenceSummary => ({
  id: 'x', protocol: 'qkd', options: { type: 'PM', bo: 'SeqA' }, label: 'PM / A2B', lemma: 'secret_key_A', heuristic: 'S', status: 'falsified - found trace',
  verified: false, steps: 15, seconds: 16, timed_out: false, hash: 'h', recorded: '2026-10-26T00:00:00', path: 'qkd/x.json', ...over,
})
const proto: Protocol = { id: 'qkd', name: 'QKD', group: 'qkd', fields: [], lemmas: [{ name: 'executability_success', kind: 'exists-trace' }, { name: 'secret_key_A', kind: 'all-traces' }] }

describe('evidence', () => {
  it('classifies cells', () => {
    expect(cellState(undefined)).toBe('none')
    expect(cellState(rec({}))).toBe('falsified')
    expect(cellState(rec({ verified: true, status: 'verified' }))).toBe('verified')
    expect(cellState(rec({ timed_out: true, status: 'timeout' }))).toBe('timeout')
  })
  it('groups records by protocol and label with catalog lemma order', () => {
    const groups = buildMatrix([rec({ id: 'a' }), rec({ id: 'b', lemma: 'executability_success', verified: true, status: 'verified' }), rec({ id: 'c', label: 'EB', lemma: 'zz' })], [proto])
    expect(groups).toHaveLength(1)
    expect(groups[0].lemmas).toEqual(['executability_success', 'secret_key_A', 'zz'])
    expect(groups[0].rows.map((r) => r.label)).toEqual(['EB', 'PM / A2B'])
    expect(groups[0].rows[1].cells.secret_key_A?.id).toBe('a')
  })
  it('attributes falsified qkd lemmas, preferring catalog expectations', () => {
    expect(attribution(rec({}), proto)).toEqual({ tag: 'V2', source: 'heuristic' })
    expect(attribution(rec({ options: { type: 'EB' } }), proto)).toEqual({ tag: 'V1', source: 'heuristic' })
    expect(attribution(rec({ lemma: 'weak_agreement_A' }), proto)).toEqual({ tag: 'V3', source: 'heuristic' })
    expect(attribution(rec({ verified: true, status: 'verified' }), proto)).toBeNull()
    const withExp: Protocol = { ...proto, expectations: [{ match: { type: 'PM' }, lemma: 'secret_key_A', attribution: 'V3' }] }
    expect(attribution(rec({}), withExp)).toEqual({ tag: 'V3', source: 'catalog' })
  })
  it('reads the flat qkd expectation shape with the countermeasure tag', () => {
    const flat: Protocol = { ...proto, expectations: [
      { type: 'PM', bo: 'SeqA', er: 'FEC', cm: 'baseline', lemma: 'secret_key_A', paper: 'falsified', vuln: 'V2', source: 'table' },
      { type: 'PM', bo: 'SeqA', er: 'FEC', cm: 'CM1', lemma: 'secret_key_A', paper: 'verified', vuln: null, source: 'prose' },
    ] }
    const base = rec({ options: { type: 'PM', bo: 'SeqA', er: 'FEC', cm1: false, cm2: false } })
    expect(cmTag(base.options)).toBe('baseline')
    expect(attribution(base, flat)).toEqual({ tag: 'V2', source: 'catalog' })
    expect(paperAgreement(base, flat)).toBe('agrees')
    const cm1 = rec({ options: { type: 'PM', bo: 'SeqA', er: 'FEC', cm1: true, cm2: false } })
    expect(cmTag(cm1.options)).toBe('CM1')
    expect(paperAgreement(cm1, flat)).toBe('disagrees')
    expect(attribution(cm1, flat)).toEqual({ tag: 'V2', source: 'heuristic' })
    expect(paperAgreement(rec({ options: { type: 'EB' } }), flat)).toBeNull()
  })
  it('finds records for a configuration and folds re-runs', () => {
    const list = [rec({ id: 'old', recorded: '2026-10-25T00:00:00' }), rec({ id: 'new', recorded: '2026-10-26T00:00:00' }), rec({ id: 'other', options: { type: 'EB', bo: 'PostM' } })]
    expect(findRecords(list, 'qkd', { type: 'PM', bo: 'SeqA', exec: true }, 'secret_key_A').map((r) => r.id)).toEqual(['new'])
    expect(findRecords(list, 'qkd', { type: 'EB', bo: 'PostM' }, null)).toHaveLength(1)
  })
})
