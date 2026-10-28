import { describe, expect, test } from 'vitest'
import { rng } from './rng.ts'
import { QState, bell, ghz, haarQubit } from './qstate.ts'

const N = 4000

describe('rng', () => {
  test('is deterministic and in [0,1)', () => {
    const a = rng(42)
    const b = rng(42)
    for (let i = 0; i < 100; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
    expect(rng(1)()).not.toBe(rng(2)())
  })
})

describe('single-qubit statistics', () => {
  test('|+> measured in Z is uniform; in X is 0', () => {
    const r = rng(1)
    const q = new QState(1)
    let ones = 0
    for (let i = 0; i < N; i++) {
      q.reset().h(0)
      ones += q.measureZ(0, r)
    }
    expect(ones / N).toBeGreaterThan(0.45)
    expect(ones / N).toBeLessThan(0.55)
    for (let i = 0; i < 50; i++) expect(q.reset().h(0).measure(0, 'X', r)).toBe(0)
  })

  test('Ry(theta)|0> gives P(1) = sin^2(theta/2)', () => {
    const r = rng(2)
    const q = new QState(1)
    const theta = Math.PI / 3
    let ones = 0
    for (let i = 0; i < N; i++) {
      q.reset().ry(0, theta)
      ones += q.measureZ(0, r)
    }
    expect(Math.abs(ones / N - Math.sin(theta / 2) ** 2)).toBeLessThan(0.03)
  })

  test('prepare/measure round-trips in every basis and collapses', () => {
    const r = rng(3)
    const q = new QState(1)
    for (const basis of ['Z', 'X', 'Y', 0.7, -2.1] as const) {
      for (const b of [0, 1] as const) {
        q.reset().prepare(0, basis, b)
        expect(q.measure(0, basis, r)).toBe(b)
        expect(q.measure(0, basis, r)).toBe(b) // collapsed: repeatable
      }
    }
    // Y eigenstate measured in Z is uniform.
    let ones = 0
    for (let i = 0; i < N; i++) ones += q.reset().prepare(0, 'Y', 1).measureZ(0, r)
    expect(Math.abs(ones / N - 0.5)).toBeLessThan(0.05)
  })

  test('full depolarizing (p = 1) flips |0> half the time', () => {
    const r = rng(4)
    const q = new QState(1)
    let ones = 0
    for (let i = 0; i < N; i++) ones += q.reset().depolarize(0, 1, r).measureZ(0, r)
    expect(Math.abs(ones / N - 0.5)).toBeLessThan(0.05)
    for (let i = 0; i < 50; i++) expect(q.reset().depolarize(0, 0, r).measureZ(0, r)).toBe(0)
  })

  test('fidelity of a Haar state with itself is 1, with its X-flipped copy it is n_x^2', () => {
    const r = rng(5)
    const q = new QState(2)
    for (let i = 0; i < 20; i++) {
      q.reset()
      const ref = haarQubit(q, 1, r)
      expect(q.fidelity1(1, ref)).toBeCloseTo(1, 9)
      // |<psi|X|psi>|^2 = (2 Re(conj(a) b))^2
      const nx = 2 * (ref.re0 * ref.re1 + ref.im0 * ref.im1)
      q.x(1)
      expect(q.fidelity1(1, ref)).toBeCloseTo(nx * nx, 9)
    }
  })
})

describe('Bell and GHZ correlations', () => {
  test('Phi+ is perfectly correlated in Z and in X, uncorrelated across', () => {
    const r = rng(6)
    const q = new QState(2)
    let same = 0
    for (let i = 0; i < 300; i++) {
      bell(q.reset(), 0, 1)
      expect(q.measure(0, 'Z', r)).toBe(q.measure(1, 'Z', r))
      bell(q.reset(), 0, 1)
      expect(q.measure(0, 'X', r)).toBe(q.measure(1, 'X', r))
      bell(q.reset(), 0, 1)
      if (q.measure(0, 'Z', r) === q.measure(1, 'X', r)) same++
    }
    expect(Math.abs(same / 300 - 0.5)).toBeLessThan(0.1)
  })

  test('E(a, b) = cos(a - b) on Phi+, so CHSH reaches 2 sqrt 2', () => {
    const r = rng(7)
    const q = new QState(2)
    const E = (a: number, b: number) => {
      let s = 0
      for (let i = 0; i < N; i++) {
        bell(q.reset(), 0, 1)
        s += q.measure(0, a, r) === q.measure(1, b, r) ? 1 : -1
      }
      return s / N
    }
    const a0 = 0, a1 = Math.PI / 2, b0 = Math.PI / 4, b1 = -Math.PI / 4
    expect(Math.abs(E(a0, b0) - Math.cos(a0 - b0))).toBeLessThan(0.04)
    expect(Math.abs(E(a1, b1) - Math.cos(a1 - b1))).toBeLessThan(0.04)
    const S = E(a0, b0) + E(a0, b1) + E(a1, b0) - E(a1, b1)
    expect(S).toBeGreaterThan(2.6)
    expect(S).toBeLessThan(2.95)
  })

  test('GHZ: equal bits in Z, even parity in X, odd parity for X Y Y', () => {
    const r = rng(8)
    const q = new QState(3)
    for (let i = 0; i < 200; i++) {
      ghz(q.reset(), 0, 1, 2)
      const a = q.measureZ(0, r)
      expect(q.measureZ(1, r)).toBe(a)
      expect(q.measureZ(2, r)).toBe(a)
      ghz(q.reset(), 0, 1, 2)
      expect(q.measure(0, 'X', r) ^ q.measure(1, 'X', r) ^ q.measure(2, 'X', r)).toBe(0)
      ghz(q.reset(), 0, 1, 2)
      expect(q.measure(0, 'X', r) ^ q.measure(1, 'Y', r) ^ q.measure(2, 'Y', r)).toBe(1)
    }
  })

  test('CNOT and CZ act on the right amplitudes', () => {
    const q = new QState(2)
    q.reset().x(0).cnot(0, 1) // |q1 q0> = |11> is index 3
    expect(q.re[3]).toBeCloseTo(1)
    q.reset().x(0).cnot(1, 0) // control q1 is 0: nothing happens, stays index 1
    expect(q.re[1]).toBeCloseTo(1)
    q.reset().x(0).x(1).cz(0, 1)
    expect(q.re[3]).toBeCloseTo(-1)
  })
})
