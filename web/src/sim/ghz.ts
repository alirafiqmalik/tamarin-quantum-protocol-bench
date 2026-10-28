/**
 * Three-party protocols on the GHZ state (|000> + |111>)/sqrt2.
 *
 * 'qss'  HBB99 quantum secret sharing: the dealer (q0), Bob (q1) and Charlie
 *        (q2) each measure in X or Y. Rounds with an even number of Y bases
 *        are valid; there b xor c (xor 1 when two bases were Y) equals the
 *        dealer's bit, so Bob and Charlie recover it only together.
 * 'cka'  Conference key agreement: key rounds measure Z (all three bits
 *        equal); test rounds measure X (even parity).
 */

import { bit, chance, type Rng } from './rng.ts'
import { QState, ghz, type Basis, type Bit } from './qstate.ts'
import { makeExperiment, type RoundResult } from './engine.ts'
import type { Experiment, SimParams, StrategyInfo } from './types.ts'

export const QSS_ROUNDS_PER_TRIAL = 256
export const CKA_ROUNDS_PER_TRIAL = 256
export const CKA_TEST_FRACTION = 0.25

export const QSS_STRATEGIES: StrategyInfo[] = [
  { id: 'none', label: 'Honest (noise only)', maps: null,
    blurb: 'Dealer, Bob and Charlie measure in X or Y; half the rounds are valid and the two parties recover the dealer’s bit together.' },
  { id: 'intercept-resend', label: 'Intercept-resend (outsider)', maps: null,
    blurb: 'Eve measures Bob’s qubit in a random basis and resends: about 25 % errors on valid rounds, and she still needs Charlie’s bit.' },
  { id: 'dishonest-party', label: 'Dishonest party holds both qubits', maps: 'V2',
    blurb: 'Charlie intercepts Bob’s qubit. If the dealer announces her basis first he measures both qubits in the right bases and recovers the secret alone; if she announces last he must guess and causes about 25 % errors.' },
]

export const CKA_STRATEGIES: StrategyInfo[] = [
  { id: 'none', label: 'Honest (noise only)', maps: null,
    blurb: 'Z-basis key rounds give three equal bits; X-basis test rounds check the GHZ parity.' },
  { id: 'intercept-resend', label: 'Intercept-resend', maps: null,
    blurb: 'Eve measures Bob’s qubit in a random Z/X basis and resends: errors on the key and parity failures on the test rounds.' },
  { id: 'dishonest-party', label: 'Dishonest party relays announcements', maps: 'V3',
    blurb: 'With one group MAC key and no identity binding, Charlie relays Alice’s announcements as his own: the quantum statistics are honest but Bob agrees a key with the wrong party.' },
]

const XY: readonly Basis[] = ['X', 'Y']
const ZX: readonly Basis[] = ['Z', 'X']

type QssMode = 'honest' | 'intercept' | 'insider-first' | 'insider-last'
type CkaMode = 'honest' | 'intercept' | 'relay'

export function qssMode(params: SimParams): { mode: QssMode; note?: string } {
  const { strategy, schedule } = params
  switch (strategy) {
    case 'intercept-resend':
      return { mode: 'intercept', note: 'An outsider measures Bob’s qubit in a random X/Y basis and resends. Half her guesses are wrong, which randomizes Bob’s bit: about 25 % errors on the valid rounds. She never learns the secret, which needs Charlie’s bit too.' }
    case 'dishonest-party':
      if (schedule.dealerOrder === 'last')
        return { mode: 'insider-last', note: 'Dealer announces last: Charlie, holding both qubits, must commit to measurement bases before he knows hers. He guesses X,X; when the dealer used Y her bit is uncorrelated with his, so about 25 % of valid rounds are wrong and he knows only half the secret bits.' }
      return { mode: 'insider-first', note: 'Dealer announces first: Charlie, holding Bob’s qubit as well as his own, measures both in bases that match hers and recovers every secret bit alone. He feeds Bob a dummy qubit and, speaking last in the check phase, answers consistently: no errors.' }
    case 'none':
      return { mode: 'honest' }
    default:
      return { mode: 'honest', note: `Strategy ${strategy} does not apply to secret sharing; running honestly.` }
  }
}

export function ckaMode(params: SimParams): { mode: CkaMode; note?: string } {
  const { strategy, schedule } = params
  switch (strategy) {
    case 'intercept-resend':
      return { mode: 'intercept', note: 'Eve measures Bob’s qubit in a random Z/X basis and resends. A wrong guess randomizes his key bit (about 25 % QBER) and breaks the X-basis parity on test rounds.' }
    case 'dishonest-party':
      if (schedule.identityBound)
        return { mode: 'honest', note: 'MAC binds identities; relay rejected. Charlie cannot pass Alice’s announcements off as his own; the run is honest.' }
      return { mode: 'relay', note: 'One group MAC key, no identity binding (V3 twin): Charlie relays Alice’s authenticated announcements to Bob as his own and vice versa. Every quantum statistic is honest, but Bob completes the conference with the wrong partner; the key he believes is three-party is controlled by the insider.' }
    case 'none':
      return { mode: 'honest' }
    default:
      return { mode: 'honest', note: `Strategy ${strategy} does not apply to conference key agreement; running honestly.` }
  }
}

/** Reconstruction rule for HBB99: dealer bit = b xor c xor (1 if exactly two of the three bases are Y). */
function qssCombine(bases: readonly Basis[], b: Bit, c: Bit): Bit {
  const ys = bases.filter((x) => x === 'Y').length
  return ((b ^ c ^ (ys === 2 ? 1 : 0)) & 1) as Bit
}

export function createQss(params: SimParams): Experiment {
  return makeExperiment(params, QSS_ROUNDS_PER_TRIAL, (r: Rng) => {
    const { mode, note } = qssMode(params)
    const noise = params.noise
    const st = new QState(3)
    const dummy = new QState(1)

    const round = (): RoundResult => {
      st.reset()
      ghz(st, 0, 1, 2)
      if (noise > 0) { st.depolarize(0, noise, r); st.depolarize(1, noise, r); st.depolarize(2, noise, r) }

      if (mode === 'insider-first') {
        // Dealer announces alpha before anyone measures; Charlie holds q1 and q2.
        const alpha = XY[bit(r)]
        const cb = XY[0]                       // q1 always in X
        const cc: Basis = alpha === 'Y' ? 'Y' : 'X' // q2 chosen so that (alpha, X, cc) is valid
        const b = st.measure(1, cb, r)
        const c = st.measure(2, cc, r)
        const guess = qssCombine([alpha, cb, cc], b, c)
        // Bob measures a dummy qubit; Charlie announces last and keeps the round
        // valid with probability 1/2 so the validity rate matches an honest run.
        dummy.reset().prepare(0, 'X', 0).measure(0, XY[bit(r)], r)
        const valid = bit(r) === 1
        const a = st.measure(0, alpha, r)
        return { sifted: valid, error: valid && guess !== a, eve: valid }
      }

      if (mode === 'insider-last') {
        // Bases are announced before the dealer's: Charlie commits to X,X.
        const b = st.measure(1, 'X', r)
        const c = st.measure(2, 'X', r)
        dummy.reset().prepare(0, 'X', 0).measure(0, XY[bit(r)], r)
        const beta = XY[bit(r)]                // Bob's announced basis
        const gamma: Basis = 'X'               // Charlie's announced basis
        const alpha = XY[bit(r)]
        const bases = [alpha, beta, gamma]
        const valid = bases.filter((x) => x === 'Y').length % 2 === 0
        const a = st.measure(0, alpha, r)
        const guess = qssCombine(bases, b, c)
        return { sifted: valid, error: valid && guess !== a, eve: valid && alpha === 'X' }
      }

      if (mode === 'intercept') st.measure(1, XY[bit(r)], r)
      const bases = [XY[bit(r)], XY[bit(r)], XY[bit(r)]]
      const a = st.measure(0, bases[0], r)
      const b = st.measure(1, bases[1], r)
      const c = st.measure(2, bases[2], r)
      const valid = bases.filter((x) => x === 'Y').length % 2 === 0
      return { sifted: valid, error: valid && qssCombine(bases, b, c) !== a, eve: false }
    }
    return { round, note }
  })
}

export function createCka(params: SimParams): Experiment {
  return makeExperiment(params, CKA_ROUNDS_PER_TRIAL, (r: Rng) => {
    const { mode, note } = ckaMode(params)
    const noise = params.noise
    const st = new QState(3)
    const round = (): RoundResult => {
      st.reset()
      ghz(st, 0, 1, 2)
      if (noise > 0) { st.depolarize(0, noise, r); st.depolarize(1, noise, r); st.depolarize(2, noise, r) }
      if (mode === 'intercept') st.measure(1, ZX[bit(r)], r)
      const test = chance(r, CKA_TEST_FRACTION)
      const basis: Basis = test ? 'X' : 'Z'
      const a = st.measure(0, basis, r)
      const b = st.measure(1, basis, r)
      const c = st.measure(2, basis, r)
      if (test) return { test: true, error: ((a ^ b ^ c) & 1) !== 0 }
      return { sifted: true, error: b !== a || c !== a, eve: mode === 'relay' }
    }
    return { round, note }
  })
}
