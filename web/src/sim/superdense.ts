/**
 * Superdense coding. The source gives Alice q0 and Bob q1 of |Phi+>. Alice
 * encodes two bits by X^b2 Z^b1 on q0 and sends it; Bob does CNOT(0,1), H(0)
 * and measures both: (q0, q1) = (b1, b2). A round is "sifted" when the message
 * was delivered; an error is a wrongly decoded message (either bit wrong).
 */

import { bit, type Rng } from './rng.ts'
import { QState, bell, type Basis, type Bit } from './qstate.ts'
import { makeExperiment, type RoundResult } from './engine.ts'
import type { Experiment, SimParams, StrategyInfo } from './types.ts'

export const SUPERDENSE_ROUNDS_PER_TRIAL = 128

export const SUPERDENSE_STRATEGIES: StrategyInfo[] = [
  { id: 'none', label: 'Honest (noise only)', maps: null,
    blurb: 'Trusted pair; Bob decodes both bits exactly.' },
  { id: 'intercept-resend', label: 'Intercept-resend', maps: null,
    blurb: 'Eve measures the flying qubit alone: it is maximally mixed, she learns nothing, and Bob decodes half the messages wrongly.' },
  { id: 'untrusted-source', label: 'Untrusted source', maps: 'V1',
    blurb: 'Eve shares one pair with Alice and another with Bob: she decodes Alice’s bits exactly and re-encodes them for Bob. No errors, message known.' },
]

type Mode = 'honest' | 'intercept' | 'source'

const BASES: readonly Basis[] = ['Z', 'X']

export function superdenseMode(params: SimParams): { mode: Mode; note?: string } {
  switch (params.strategy) {
    case 'intercept-resend':
      return { mode: 'intercept', note: 'Eve measures the flying qubit on its own. Its reduced state is I/2 whatever Alice encoded, so her outcome is independent of the message; her collapse destroys one of the two bits, so Bob decodes 50 % of messages wrongly (bit error 25 %).' }
    case 'untrusted-source':
      return { mode: 'source', note: 'Untrusted source: Eve holds the partner of Alice’s qubit, performs the Bell decoding herself and learns both bits, then encodes them onto her half of a second pair whose other half she gave to Bob. Bob decodes correctly; the message is known.' }
    case 'none':
      return { mode: 'honest' }
    default:
      return { mode: 'honest', note: `Strategy ${params.strategy} does not apply to superdense coding; running honestly.` }
  }
}

function encode(st: QState, q: number, b1: Bit, b2: Bit): void {
  if (b2) st.x(q)
  if (b1) st.z(q)
}

function decode(st: QState, r: Rng): [Bit, Bit] {
  st.cnot(0, 1).h(0)
  return [st.measureZ(0, r), st.measureZ(1, r)]
}

export function createSuperdense(params: SimParams): Experiment {
  return makeExperiment(params, SUPERDENSE_ROUNDS_PER_TRIAL, (r: Rng) => {
    const { mode, note } = superdenseMode(params)
    const noise = params.noise
    const pair = new QState(2)
    const pair2 = new QState(2)
    const round = (): RoundResult => {
      const b1 = bit(r)
      const b2 = bit(r)
      pair.reset()
      bell(pair, 0, 1)
      if (noise > 0) pair.depolarize(1, noise, r)
      encode(pair, 0, b1, b2)
      let eve = false
      let d1: Bit
      let d2: Bit
      if (mode === 'source') {
        // Eve holds q1 of `pair`: she decodes Alice's message exactly.
        const [e1, e2] = decode(pair, r)
        eve = true
        pair2.reset()
        bell(pair2, 0, 1)
        encode(pair2, 0, e1, e2)
        if (noise > 0) pair2.depolarize(0, noise, r)
        ;[d1, d2] = decode(pair2, r)
      } else {
        if (mode === 'intercept') pair.measure(0, BASES[bit(r)], r)
        if (noise > 0) pair.depolarize(0, noise, r)
        ;[d1, d2] = decode(pair, r)
      }
      return { sifted: true, error: d1 !== b1 || d2 !== b2, eve }
    }
    return { round, note }
  })
}
