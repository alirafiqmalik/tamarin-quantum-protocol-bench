import { describe, expect, it } from 'vitest'
import type { VerifyResult } from './api'
import { lemmaVerdict, pickLemma, takeaway } from './takeaway'

const result: VerifyResult = {
  label: 'PM / Network / FEC / A2B', heuristic: 'S', lemma: 'secret_key_A', version: '1.12.0', hash: 'abc', seconds: 16.7, timed_out: false, cached: false,
  lemmas: [{ name: 'secret_key_A', quantifier: 'all-traces', status: 'falsified - found trace', verified: false, steps: 15 }],
}

describe('takeaway', () => {
  it('describes a sampled run and a counterexample', () => {
    const text = takeaway({ shots: 120000, detected: false, attacksPresent: true, qber: 0.001, eveKnows: 1 }, result, pickLemma(result, 'secret_key_A'))
    expect(text).toBe('Simulation: 120,000 shots, 0 detections, attacker knows 100 % of the key. Proof: counterexample in 15 steps, 17 s.')
  })
  it('marks timeouts as inconclusive and reports running state', () => {
    expect(takeaway(null, { ...result, timed_out: true, lemmas: [] }, null)).toContain('inconclusive')
    expect(takeaway(null, null, null, true, 4.2)).toBe('Simulation: not started. Proof: Tamarin running, 4 s elapsed.')
  })
  it('classifies verdicts', () => {
    expect(lemmaVerdict(result.lemmas[0])).toBe('falsified')
    expect(lemmaVerdict({ ...result.lemmas[0], verified: true, status: 'verified' })).toBe('verified')
    expect(lemmaVerdict(null, true)).toBe('timeout')
  })
})
