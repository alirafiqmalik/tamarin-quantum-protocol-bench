/**
 * Seeded pseudo-random numbers (mulberry32). Deterministic for a given seed,
 * fast, and good enough for sampling measurement outcomes in a demo.
 */

export type Rng = () => number

/** Returns a generator of numbers in [0, 1). The seed is reduced to a 32-bit integer. */
export function rng(seed: number): Rng {
  let a = (Math.floor(Number.isFinite(seed) ? seed : 0) >>> 0) ^ 0x9e3779b9
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A uniformly random bit. */
export function bit(r: Rng): 0 | 1 {
  return r() < 0.5 ? 0 : 1
}

/** True with probability p. */
export function chance(r: Rng, p: number): boolean {
  return p > 0 && r() < p
}

/** A uniformly random element of a non-empty array. */
export function pick<T>(r: Rng, xs: readonly T[]): T {
  return xs[Math.min(xs.length - 1, Math.floor(r() * xs.length))]
}
