/**
 * Entanglement-based QKD (BBM92 with CHSH test rounds).
 * A source emits |Phi+> pairs. Key rounds: Alice and Bob measure in random Z/X
 * bases and keep the rounds where the bases match. Test rounds (one in four):
 * Alice uses Bloch angle 0 or pi/2, Bob pi/4 or -pi/4; the engine estimates
 * CHSH S = E(a0,b0) + E(a0,b1) + E(a1,b0) - E(a1,b1), ideally 2 sqrt 2.
 */

import { bit, chance, type Rng } from './rng.ts'
import { QState, bell, type Basis } from './qstate.ts'
import { makeExperiment, type RoundResult } from './engine.ts'
import type { Experiment, SimParams, StrategyInfo } from './types.ts'

export const EBQKD_ROUNDS_PER_TRIAL = 512
export const TEST_FRACTION = 0.25
export const ALICE_TEST: readonly number[] = [0, Math.PI / 2]
export const BOB_TEST: readonly number[] = [Math.PI / 4, -Math.PI / 4]

export const EBQKD_STRATEGIES: StrategyInfo[] = [
  { id: 'none', label: 'Honest (noise only)', maps: null,
    blurb: 'A trusted source emits Bell pairs; errors come only from channel noise; CHSH S near 2.83.' },
  { id: 'intercept-resend', label: 'Intercept-resend', maps: null,
    blurb: 'Eve measures Bob’s qubit in a random basis and resends: about 25 % QBER and the CHSH value drops below 2.' },
  { id: 'v1-injection', label: 'V1: entanglement injection', maps: 'V1',
    blurb: 'Eve owns the source, keeps a qubit of each pair, learns Bob’s basis, then hands Alice a matching product state: QBER 0 and the key known; only a Bell test can tell.' },
]

type Mode = 'honest' | 'intercept' | 'inject'

const BASES: readonly Basis[] = ['Z', 'X']

export function ebqkdMode(params: SimParams): { mode: Mode; note?: string } {
  switch (params.strategy) {
    case 'intercept-resend':
      return { mode: 'intercept', note: 'Intercept-resend on Bob’s qubit: a wrong basis guess gives Bob a random bit (QBER about 25 %); the resent product state cannot violate CHSH.' }
    case 'v1-injection':
      return { mode: 'inject', note: params.schedule.commitment === false
        ? 'V1 with all bases announced before Alice measures (no commitment): Eve prepares Alice’s qubit in Bob’s announced setting on every round, so even the CHSH test passes. QBER 0, S about 2.83, key known.'
        : 'V1: Eve keeps one qubit of every pair and delays Alice’s. After Bob announces his key basis she measures hers in it and sends Alice the matching state: QBER 0, key known. The CHSH settings are only revealed after Alice has measured, so on test rounds she can only send a product state and S stays at or below 2.' }
    case 'none':
      return { mode: 'honest' }
    default:
      return { mode: 'honest', note: `Strategy ${params.strategy} does not apply to EB QKD; running honestly.` }
  }
}

export function createEbqkd(params: SimParams): Experiment {
  return makeExperiment(params, EBQKD_ROUNDS_PER_TRIAL, (r: Rng) => {
    const { mode, note } = ebqkdMode(params)
    const noise = params.noise
    const leakAll = params.schedule.commitment === false
    const pair = new QState(2) // q0 Alice (or Eve in inject mode), q1 Bob
    const single = new QState(1) // Alice's qubit in inject mode
    const sign = (a: 0 | 1, b: 0 | 1): 1 | -1 => (a === b ? 1 : -1)

    const round = (): RoundResult => {
      const test = chance(r, TEST_FRACTION)
      pair.reset()
      bell(pair, 0, 1)

      if (mode === 'inject') {
        // Eve holds q0, Bob gets q1 (through the noisy link).
        if (noise > 0) pair.depolarize(1, noise, r)
        if (!test) {
          const bBasis = BASES[bit(r)]
          const bBit = pair.measure(1, bBasis, r)
          // Bob announces bBasis; Eve measures her qubit in it and prepares Alice's.
          const eBit = pair.measure(0, bBasis, r)
          single.reset().prepare(0, bBasis, eBit)
          if (noise > 0) single.depolarize(0, noise, r)
          const aBasis = BASES[bit(r)]
          const aBit = single.measure(0, aBasis, r)
          const sifted = aBasis === bBasis
          return { sifted, error: sifted && aBit !== bBit, eve: sifted }
        }
        const b = bit(r)
        const bBit = pair.measure(1, BOB_TEST[b], r)
        // With commitment === false Bob's test setting is public before Alice measures;
        // otherwise Eve must choose a basis blindly (she takes Z): a product state, S <= 2.
        const eBasis: Basis = leakAll ? BOB_TEST[b] : 'Z'
        const eBit = pair.measure(0, eBasis, r)
        single.reset().prepare(0, eBasis, eBit)
        if (noise > 0) single.depolarize(0, noise, r)
        const a = bit(r)
        const aBit = single.measure(0, ALICE_TEST[a], r)
        return { chsh: { a, b, prod: sign(aBit, bBit) } }
      }

      let eBasis: Basis | null = null
      if (mode === 'intercept') {
        eBasis = BASES[bit(r)]
        pair.measure(1, eBasis, r) // collapse = resend what she saw
      }
      if (noise > 0) { pair.depolarize(0, noise, r); pair.depolarize(1, noise, r) }
      if (!test) {
        const aBasis = BASES[bit(r)]
        const bBasis = BASES[bit(r)]
        const aBit = pair.measure(0, aBasis, r)
        const bBit = pair.measure(1, bBasis, r)
        const sifted = aBasis === bBasis
        return { sifted, error: sifted && aBit !== bBit, eve: sifted && eBasis === bBasis }
      }
      const a = bit(r)
      const b = bit(r)
      const aBit = pair.measure(0, ALICE_TEST[a], r)
      const bBit = pair.measure(1, BOB_TEST[b], r)
      return { chsh: { a, b, prod: sign(aBit, bBit) } }
    }
    return { round, note }
  })
}
