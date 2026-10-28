/**
 * Quantum teleportation of a Haar-random single-qubit state.
 * q0: Alice's input state, q1: Alice's half of the pair, q2: Bob's half.
 * Alice does a Bell measurement (CNOT, H, measure both) and sends two bits
 * (m1 phase, m2 flip); Bob applies X^m2 then Z^m1. counters.fidelity is the
 * mean fidelity of Bob's qubit with Alice's input.
 */

import { bit, type Rng } from './rng.ts'
import { QState, bell, haarQubit } from './qstate.ts'
import { makeExperiment, type RoundResult } from './engine.ts'
import type { Experiment, SimParams, StrategyInfo } from './types.ts'

export const TELEPORT_ROUNDS_PER_TRIAL = 64

/** A round counts as an error when Bob's state is not the input (fidelity below this). */
export const FIDELITY_OK = 1 - 1e-9

export const TELEPORT_STRATEGIES: StrategyInfo[] = [
  { id: 'none', label: 'Honest (noise only)', maps: null,
    blurb: 'Trusted pair, authenticated correction bits; Bob reconstructs the state with fidelity 1.' },
  { id: 'tamper-classical', label: 'Tamper with the correction bits', maps: 'V3',
    blurb: 'Eve replaces the two classical correction bits on an unauthenticated channel; Bob applies the wrong correction and the mean fidelity falls to about 0.5.' },
  { id: 'untrusted-source', label: 'Untrusted source', maps: 'V1',
    blurb: 'Eve plays the source: she keeps Bob’s half, reads the (authenticated) correction bits, obtains the state herself and then delivers it to Bob late: fidelity 1, state held by the attacker.' },
]

type Mode = 'honest' | 'tamper' | 'source'

export function teleportMode(params: SimParams): { mode: Mode; note?: string } {
  const { strategy, schedule } = params
  switch (strategy) {
    case 'tamper-classical':
      if (schedule.authenticated === false)
        return { mode: 'tamper', note: 'Unauthenticated correction bits: Eve substitutes random bits, so Bob applies the wrong Pauli in three rounds out of four. Mean fidelity about 0.5 (1/4 of 1 plus 3/4 of 1/3).' }
      return { mode: 'honest', note: 'The correction bits carry a MAC; Eve’s substituted message is rejected and Bob uses the authentic bits. Fidelity stays 1.' }
    case 'untrusted-source':
      return { mode: 'source', note: 'Untrusted source (V1 twin): Eve shares the pair with Alice and keeps the other half herself. Alice’s correction bits are authenticated but readable, so Eve completes the teleportation and holds the state. She then delivers to Bob, late, a qubit prepared so that his correction yields the same state: fidelity 1, nothing to sample.' }
    case 'none':
      return { mode: 'honest' }
    default:
      return { mode: 'honest', note: `Strategy ${strategy} does not apply to teleportation; running honestly.` }
  }
}

export function createTeleport(params: SimParams): Experiment {
  return makeExperiment(params, TELEPORT_ROUNDS_PER_TRIAL, (r: Rng) => {
    const { mode, note } = teleportMode(params)
    const noise = params.noise
    const st = new QState(3)
    const round = (): RoundResult => {
      st.reset()
      const ref = haarQubit(st, 0, r)
      bell(st, 1, 2)
      if (noise > 0) { st.depolarize(1, noise, r); st.depolarize(2, noise, r) }
      // Alice's Bell measurement on (q0, q1).
      st.cnot(0, 1).h(0)
      const m1 = st.measureZ(0, r)
      const m2 = st.measureZ(1, r)
      let c1 = m1
      let c2 = m2
      let eve = false
      if (mode === 'tamper') {
        c1 = bit(r)
        c2 = bit(r)
      } else if (mode === 'source') {
        // Eve holds q2: she applies the corrections and now has the state.
        if (m2) st.x(2)
        if (m1) st.z(2)
        eve = true
        // She sends Bob X^m2 Z^m1 |psi> so that his own correction undoes it.
        if (m1) st.z(2)
        if (m2) st.x(2)
        if (noise > 0) st.depolarize(2, noise, r)
      }
      if (c2) st.x(2)
      if (c1) st.z(2)
      const fidelity = st.fidelity1(2, ref)
      return { sifted: true, error: fidelity < FIDELITY_OK, eve, fidelity }
    }
    return { round, note }
  })
}
