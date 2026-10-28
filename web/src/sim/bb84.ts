/**
 * BB84, prepare-and-measure.
 * Per round Alice picks a bit and a basis (Z or X) and prepares one qubit; the
 * qubit crosses a depolarizing channel; Bob picks a basis and measures.
 * Sifting keeps the rounds where the bases match; errors are counted there.
 */

import { bit, type Rng } from './rng.ts'
import { QState, type Basis } from './qstate.ts'
import { makeExperiment, type RoundResult } from './engine.ts'
import type { Experiment, SimParams, StrategyInfo } from './types.ts'

export const BB84_ROUNDS_PER_TRIAL = 256

export const BB84_STRATEGIES: StrategyInfo[] = [
  { id: 'none', label: 'Honest (noise only)', maps: null,
    blurb: 'Alice prepares, Bob measures; the only errors come from channel noise.' },
  { id: 'intercept-resend', label: 'Intercept-resend', maps: null,
    blurb: 'Eve measures each qubit in a random basis and resends what she saw: about 25 % QBER on the sifted key.' },
  { id: 'v2-deferred', label: 'V2: basis-deferred measurement', maps: 'V2',
    blurb: 'Eve stores the qubit, waits for Alice to announce the basis, measures in it and resends an identical state: QBER 0, every sifted bit known.' },
  { id: 'v3-reflection', label: 'V3: message reflection', maps: 'V3',
    blurb: 'Classical only: with a MAC that does not bind identities Eve reflects announcements so a party completes the session with itself.' },
]

type Mode = 'honest' | 'intercept' | 'deferred' | 'reflect'

const BASES: readonly Basis[] = ['Z', 'X']

/** Resolve the effective behaviour from strategy and schedule, with the note shown in the UI. */
export function bb84Mode(params: SimParams): { mode: Mode; note?: string } {
  const { strategy, schedule } = params
  switch (strategy) {
    case 'intercept-resend':
      return { mode: 'intercept', note: 'Intercept-resend: Eve guesses a basis for every qubit; half her guesses are wrong and each wrong guess gives Bob a random bit (QBER about 25 %).' }
    case 'v2-deferred':
      if (schedule.basisOrder === 'B2A')
        return { mode: 'intercept', note: 'Schedule B2A: Bob announces his basis first, so Bob must measure before Alice says anything. Eve cannot hold the qubit back; V2 degrades to intercept-resend and is caught.' }
      if (schedule.commitment)
        return { mode: 'intercept', note: 'CM1 measurement commitment: Bob commits to his outcome before any basis is announced, so the qubit must reach Bob first. V2 degrades to intercept-resend and is caught.' }
      return { mode: 'deferred', note: 'V2 (A2B, no commitment): Eve stores each qubit, reads Alice’s basis announcement, measures in that basis and resends an identical state. QBER stays at the honest level; Eve knows every sifted bit.' }
    case 'v3-reflection':
      if (schedule.identityBound)
        return { mode: 'honest', note: 'MAC binds identities; reflection rejected. The run is honest.' }
      return { mode: 'reflect', note: schedule.authenticated === false
        ? 'No MAC at all: Eve reflects Alice’s announcements back to her; Alice completes a session with herself. The quantum statistics are honest, so sampling sees nothing.'
        : 'V3: the MAC does not bind sender and receiver, so Eve reflects Alice’s authenticated announcements back to her; Alice completes a session with herself. The quantum statistics are honest, so sampling sees nothing.' }
    case 'none':
      return { mode: 'honest' }
    default:
      return { mode: 'honest', note: `Strategy ${strategy} does not apply to BB84; running honestly.` }
  }
}

export function createBb84(params: SimParams): Experiment {
  return makeExperiment(params, BB84_ROUNDS_PER_TRIAL, (r: Rng) => {
    const { mode, note } = bb84Mode(params)
    const noise = params.noise
    const q = new QState(1)
    const round = (): RoundResult => {
      q.reset()
      const aBit = bit(r)
      const aBasis = BASES[bit(r)]
      q.prepare(0, aBasis, aBit)
      let eveBasisMatch = false
      if (mode === 'intercept') {
        const eBasis = BASES[bit(r)]
        q.measure(0, eBasis, r) // collapse = resend the state she saw
        eveBasisMatch = eBasis === aBasis
      } else if (mode === 'deferred') {
        // Alice's basis is known before Eve measures: no disturbance, exact knowledge.
        q.measure(0, aBasis, r)
      }
      if (noise > 0) q.depolarize(0, noise, r)
      const bBasis = BASES[bit(r)]
      const bBit = q.measure(0, bBasis, r)
      const sifted = bBasis === aBasis
      const error = sifted && bBit !== aBit
      const eve = sifted && (mode === 'deferred' || mode === 'reflect' || (mode === 'intercept' && eveBasisMatch))
      return { sifted, error, eve }
    }
    return { round, note }
  })
}

/** The sifted error rate that the depolarizing channel alone produces. */
export function expectedNoiseQber(noise: number): number {
  return noise / 2
}
