import { describe, expect, test } from 'vitest'
import { sim, normalizeParams } from './index.ts'
import type { Counters, SimParams } from './types.ts'

type P = Partial<SimParams> & Pick<SimParams, 'protocol'>

function run(p: P, rounds = 8192): Counters {
  const e = sim.create(normalizeParams({ seed: 11, ...p }))
  let left = rounds
  while (left > 0) { const n = Math.min(500, left); e.step(n); left -= n }
  return e.counters()
}

describe('bb84', () => {
  test('honest, no noise: QBER < 0.02, Eve knows nothing', () => {
    const c = run({ protocol: 'bb84', strategy: 'none' })
    expect(c.qber).toBeLessThan(0.02)
    expect(c.eveKnows).toBe(0)
    expect(c.detected).toBe(false)
    expect(c.sifted).toBeGreaterThan(rounds(c) * 0.4)
  })
  test('honest with noise p: QBER about p/2', () => {
    const c = run({ protocol: 'bb84', strategy: 'none', noise: 0.1 })
    expect(Math.abs(c.qber - 0.05)).toBeLessThan(0.02)
  })
  test('intercept-resend: QBER in [0.20, 0.30], detected, Eve knows about half', () => {
    const c = run({ protocol: 'bb84', strategy: 'intercept-resend' })
    expect(c.qber).toBeGreaterThanOrEqual(0.2)
    expect(c.qber).toBeLessThanOrEqual(0.3)
    expect(c.detected).toBe(true)
    expect(Math.abs(c.eveKnows - 0.5)).toBeLessThan(0.05)
  })
  test('v2-deferred under A2B: QBER < 0.02 and eveKnows > 0.98', () => {
    const c = run({ protocol: 'bb84', strategy: 'v2-deferred', schedule: { basisOrder: 'A2B' } })
    expect(c.qber).toBeLessThan(0.02)
    expect(c.eveKnows).toBeGreaterThan(0.98)
    expect(c.detected).toBe(false)
  })
  test('v2-deferred under B2A or with CM1 degrades to intercept-resend', () => {
    for (const schedule of [{ basisOrder: 'B2A' as const }, { basisOrder: 'A2B' as const, commitment: true }]) {
      const e = sim.create(normalizeParams({ protocol: 'bb84', strategy: 'v2-deferred', schedule }))
      const b = e.step(4096)
      expect(b.counters.qber).toBeGreaterThan(0.2)
      expect(b.counters.detected).toBe(true)
      expect(b.note).toMatch(/intercept-resend/)
    }
  })
  test('v3-reflection: honest statistics, Eve "knows" unless the MAC binds identities', () => {
    const a = sim.create(normalizeParams({ protocol: 'bb84', strategy: 'v3-reflection', schedule: { authenticated: true } }))
    const ba = a.step(2048)
    expect(ba.counters.qber).toBeLessThan(0.02)
    expect(ba.counters.eveKnows).toBe(1)
    const b = sim.create(normalizeParams({ protocol: 'bb84', strategy: 'v3-reflection', schedule: { authenticated: true, identityBound: true } }))
    const bb = b.step(2048)
    expect(bb.counters.eveKnows).toBe(0)
    expect(bb.note).toMatch(/MAC binds identities; reflection rejected/)
  })
})

describe('ebqkd', () => {
  test('honest: QBER < 0.02 and CHSH S > 2.6', () => {
    const c = run({ protocol: 'ebqkd', strategy: 'none', seed: 3 }, 16384)
    expect(c.qber).toBeLessThan(0.02)
    expect(c.chsh).toBeGreaterThan(2.6)
    expect(c.bellDetected).toBe(false)
  })
  test('intercept-resend: QBER about 25 % and S below 2', () => {
    const c = run({ protocol: 'ebqkd', strategy: 'intercept-resend' }, 16384)
    expect(c.qber).toBeGreaterThan(0.2)
    expect(c.qber).toBeLessThan(0.3)
    expect(c.chsh).toBeLessThan(2)
    expect(c.detected).toBe(true)
  })
  test('v1-injection: QBER < 0.02, eveKnows > 0.98, QBER does not detect; only CHSH does', () => {
    const c = run({ protocol: 'ebqkd', strategy: 'v1-injection' }, 16384)
    expect(c.qber).toBeLessThan(0.02)
    expect(c.eveKnows).toBeGreaterThan(0.98)
    expect(c.detected).toBe(false)
    expect(c.chsh).toBeLessThan(2)
    expect(c.bellDetected).toBe(true)
  })
  test('v1-injection with bases announced before Alice measures passes CHSH too', () => {
    const c = run({ protocol: 'ebqkd', strategy: 'v1-injection', schedule: { commitment: false } }, 16384)
    expect(c.qber).toBeLessThan(0.02)
    expect(c.eveKnows).toBeGreaterThan(0.98)
    expect(c.chsh).toBeGreaterThan(2.6)
    expect(c.bellDetected).toBe(false)
  })
})

describe('teleport', () => {
  test('honest fidelity 1', () => {
    const c = run({ protocol: 'teleport', strategy: 'none' }, 1024)
    expect(c.fidelity).toBeGreaterThan(0.999)
  })
  test('tamper on an unauthenticated channel: fidelity in [0.4, 0.6]', () => {
    const c = run({ protocol: 'teleport', strategy: 'tamper-classical', schedule: { authenticated: false } }, 4096)
    expect(c.fidelity).toBeGreaterThan(0.4)
    expect(c.fidelity).toBeLessThan(0.6)
  })
  test('tamper on an authenticated channel is rejected: fidelity > 0.99', () => {
    const c = run({ protocol: 'teleport', strategy: 'tamper-classical', schedule: { authenticated: true } }, 1024)
    expect(c.fidelity).toBeGreaterThan(0.99)
  })
  test('untrusted source: fidelity 1 and the attacker held the state', () => {
    const c = run({ protocol: 'teleport', strategy: 'untrusted-source', schedule: { authenticated: true } }, 1024)
    expect(c.fidelity).toBeGreaterThan(0.999)
    expect(c.eveKnows).toBe(1)
    expect(c.detected).toBe(false)
  })
})

describe('superdense', () => {
  test('honest decodes exactly', () => {
    expect(run({ protocol: 'superdense', strategy: 'none' }, 1024).qber).toBe(0)
  })
  test('intercept-resend: Eve learns nothing, half the messages are wrong', () => {
    const c = run({ protocol: 'superdense', strategy: 'intercept-resend' }, 4096)
    expect(c.eveKnows).toBe(0)
    expect(Math.abs(c.qber - 0.5)).toBeLessThan(0.04)
  })
  test('untrusted source: eveKnows > 0.98 without errors', () => {
    const c = run({ protocol: 'superdense', strategy: 'untrusted-source' }, 1024)
    expect(c.eveKnows).toBeGreaterThan(0.98)
    expect(c.qber).toBe(0)
  })
})

describe('qss and cka', () => {
  test('qss honest: valid rounds reconstruct the dealer bit', () => {
    const c = run({ protocol: 'qss', strategy: 'none' }, 4096)
    expect(c.qber).toBe(0)
    expect(Math.abs(c.sifted / c.shots - 0.5)).toBeLessThan(0.05)
  })
  test('qss intercept-resend: about 25 % errors, no secret', () => {
    const c = run({ protocol: 'qss', strategy: 'intercept-resend' }, 8192)
    expect(Math.abs(c.qber - 0.25)).toBeLessThan(0.04)
    expect(c.eveKnows).toBe(0)
  })
  test('qss dishonest party, dealer first: eveKnows > 0.98 with no errors', () => {
    const c = run({ protocol: 'qss', strategy: 'dishonest-party', schedule: { dealerOrder: 'first' } }, 4096)
    expect(c.eveKnows).toBeGreaterThan(0.98)
    expect(c.qber).toBeLessThan(0.02)
  })
  test('qss dishonest party, dealer last: QBER > 0.15', () => {
    const c = run({ protocol: 'qss', strategy: 'dishonest-party', schedule: { dealerOrder: 'last' } }, 8192)
    expect(c.qber).toBeGreaterThan(0.15)
    expect(c.detected).toBe(true)
  })
  test('cka honest: no key errors and no parity failures', () => {
    const c = run({ protocol: 'cka', strategy: 'none' }, 4096)
    expect(c.qber).toBe(0)
    expect(c.testErrors).toBe(0)
    expect(c.testRounds).toBeGreaterThan(500)
  })
  test('cka intercept-resend: key errors and parity failures', () => {
    const c = run({ protocol: 'cka', strategy: 'intercept-resend' }, 8192)
    expect(Math.abs(c.qber - 0.25)).toBeLessThan(0.04)
    expect(c.bellDetected).toBe(true)
  })
  test('cka relay: honest statistics, eveKnows 1 unless the MAC binds identities', () => {
    const a = run({ protocol: 'cka', strategy: 'dishonest-party', schedule: { identityBound: false } }, 2048)
    expect(a.qber).toBe(0)
    expect(a.eveKnows).toBe(1)
    const b = run({ protocol: 'cka', strategy: 'dishonest-party', schedule: { identityBound: true } }, 2048)
    expect(b.eveKnows).toBe(0)
  })
})

describe('engine', () => {
  test('same seed gives identical counters; chunking does not matter; reset restarts', () => {
    const p = normalizeParams({ protocol: 'ebqkd', strategy: 'intercept-resend', noise: 0.03, seed: 99 })
    const a = sim.create(p)
    const b = sim.create(p)
    for (let i = 0; i < 10; i++) a.step(300)
    b.step(1000); b.step(2000)
    expect(a.counters()).toEqual(b.counters())
    a.reset()
    a.step(3000)
    expect(a.counters()).toEqual(b.counters())
    const c = sim.create({ ...p, seed: 100 })
    c.step(3000)
    expect(c.counters()).not.toEqual(b.counters())
  })
  test('paths: at most 8 per step, 6..12 points each, coordinates in [0,1]', () => {
    const e = sim.create(normalizeParams({ protocol: 'bb84', strategy: 'intercept-resend' }))
    for (const n of [1, 5, 8, 9, 200, 500]) {
      const b = e.step(n)
      expect(b.paths.length).toBeLessThanOrEqual(8)
      expect(b.paths.length).toBe(Math.min(n, 8))
      for (const path of b.paths) {
        expect(path.points.length).toBeGreaterThanOrEqual(6)
        expect(path.points.length).toBeLessThanOrEqual(12)
        expect(path.points[0][0]).toBe(0)
        expect(path.points[path.points.length - 1][0]).toBe(1)
        for (const [x, y] of path.points) {
          expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1)
          expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1)
        }
        expect(['ok', 'error', 'eve']).toContain(path.outcome)
      }
    }
  })
  test('trials complete every roundsPerTrial rounds with per-trial statistics', () => {
    const info = sim.protocols.find((p) => p.id === 'bb84')!
    const e = sim.create(normalizeParams({ protocol: 'bb84', strategy: 'intercept-resend' }))
    const b = e.step(info.roundsPerTrial * 3 + 1)
    expect(b.trials.length).toBe(3)
    expect(b.trials.map((t) => t.index)).toEqual([0, 1, 2])
    for (const t of b.trials) { expect(t.detected).toBe(true); expect(t.qber).toBeGreaterThan(0.1) }
    expect(e.counters().trials).toBe(3)
  })
  test('protocol metadata lists strategies with V1/V2/V3 mapping', () => {
    const ids = sim.protocols.map((p) => p.id)
    expect(ids).toEqual(['bb84', 'ebqkd', 'teleport', 'superdense', 'qss', 'cka'])
    const maps = new Set(sim.protocols.flatMap((p) => p.strategies.map((s) => s.maps)))
    expect(maps.has('V1')).toBe(true)
    expect(maps.has('V2')).toBe(true)
    expect(maps.has('V3')).toBe(true)
    for (const p of sim.protocols) for (const s of p.strategies) expect(s.blurb.length).toBeGreaterThan(10)
  })
  test('a strategy that does not apply runs honestly with a note', () => {
    const e = sim.create(normalizeParams({ protocol: 'bb84', strategy: 'untrusted-source' }))
    const b = e.step(512)
    expect(b.counters.qber).toBe(0)
    expect(b.note).toMatch(/does not apply/)
  })
  test('step(500) is fast for bb84 and ebqkd', () => {
    for (const protocol of ['bb84', 'ebqkd'] as const) {
      const e = sim.create(normalizeParams({ protocol, strategy: 'intercept-resend', noise: 0.02 }))
      e.step(500) // warm up
      const t0 = performance.now()
      for (let i = 0; i < 5; i++) e.step(500)
      expect((performance.now() - t0) / 5).toBeLessThan(16)
    }
  })
})

function rounds(c: Counters): number { return c.shots }
