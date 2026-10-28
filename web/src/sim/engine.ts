/**
 * Shared bookkeeping for all protocols: counters, trials, sampled paths.
 * A protocol supplies a `round` function; the engine turns it into an Experiment.
 */

import { rng, type Rng } from './rng.ts'
import type { Batch, Counters, Experiment, Path, SimParams, Trial } from './types.ts'

/** What one round reports back to the engine. All fields optional. */
export interface RoundResult {
  /** Round kept after sifting (QKD), completed transfer (teleport/superdense), valid combination (QSS). */
  sifted?: boolean
  /** Error inside a sifted round, or inside a test round when `test` is set. */
  error?: boolean
  /** The attacker knows this sifted value (or held the state). */
  eve?: boolean
  /** Teleportation: fidelity of Bob's state with Alice's input. */
  fidelity?: number
  /** EB QKD CHSH test round: setting indices and the product of the +-1 outcomes. */
  chsh?: { a: 0 | 1; b: 0 | 1; prod: 1 | -1 }
  /** CKA: X-basis parity test round (error flag in `error`). */
  test?: boolean
}

export interface ProtocolRunner {
  round(): RoundResult
  /** Short text explaining what the attacker does under this configuration. */
  note?: string
}

export type Build = (r: Rng, params: SimParams) => ProtocolRunner

/** Minimum number of test rounds before the Bell/parity test is allowed to flag a run. */
export const MIN_TEST_ROUNDS = 64

class Acc {
  shots = 0
  sifted = 0
  errors = 0
  eveBits = 0
  fidSum = 0
  fidN = 0
  chshSum = [[0, 0], [0, 0]]
  chshN = [[0, 0], [0, 0]]
  testRounds = 0
  testErrors = 0

  push(x: RoundResult): void {
    this.shots++
    if (x.sifted) {
      this.sifted++
      if (x.error) this.errors++
      if (x.eve) this.eveBits++
    }
    if (x.fidelity !== undefined) { this.fidSum += x.fidelity; this.fidN++ }
    if (x.chsh) {
      this.chshSum[x.chsh.a][x.chsh.b] += x.chsh.prod
      this.chshN[x.chsh.a][x.chsh.b]++
      this.testRounds++
    }
    if (x.test) {
      this.testRounds++
      if (x.error) this.testErrors++
    }
  }

  qber(): number { return this.sifted ? this.errors / this.sifted : 0 }
  eveKnows(): number { return this.sifted ? this.eveBits / this.sifted : 0 }
  fidelity(): number | undefined { return this.fidN ? this.fidSum / this.fidN : undefined }

  /** CHSH S = E(a0,b0) + E(a0,b1) + E(a1,b0) - E(a1,b1); undefined until every setting pair has a sample. */
  chsh(): number | undefined {
    const n = this.chshN
    if (!n[0][0] || !n[0][1] || !n[1][0] || !n[1][1]) return undefined
    const E = (a: number, b: number) => this.chshSum[a][b] / n[a][b]
    return E(0, 0) + E(0, 1) + E(1, 0) - E(1, 1)
  }
}

function makePath(pr: Rng, outcome: Path['outcome']): Path {
  const n = 6 + Math.floor(pr() * 7) // 6..12 points
  let y = 0.15 + 0.7 * pr()
  const points: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1)
    y += (pr() - 0.5) * 0.22
    if (y < 0.03) y = 0.03
    if (y > 0.97) y = 0.97
    points.push([x, y])
  }
  return { points, outcome }
}

/**
 * Build an Experiment from a per-round function.
 * The physics RNG is seeded from params.seed; the path RNG is a separate stream
 * so the counters after N rounds do not depend on how the UI chunks step().
 */
export function makeExperiment(params: SimParams, roundsPerTrial: number, build: Build): Experiment {
  const threshold = params.threshold
  let r = rng(params.seed)
  let pr = rng(params.seed ^ 0x5bd1e995)
  let runner = build(r, params)
  let total = new Acc()
  let trial = new Acc()
  let trialsDone = 0
  let usesChsh = false
  let usesTest = false

  const bellDetected = (a: Acc): boolean | undefined => {
    if (usesChsh) {
      const s = a.chsh()
      return a.testRounds >= MIN_TEST_ROUNDS && s !== undefined && s < 2
    }
    if (usesTest) return a.testRounds >= MIN_TEST_ROUNDS && a.testErrors / a.testRounds > threshold
    return undefined
  }

  const counters = (): Counters => {
    const c: Counters = {
      shots: total.shots,
      sifted: total.sifted,
      errors: total.errors,
      qber: total.qber(),
      eveBits: total.eveBits,
      eveKnows: total.eveKnows(),
      detected: total.sifted > 0 && total.qber() > threshold,
      trials: trialsDone,
    }
    const f = total.fidelity()
    if (f !== undefined) c.fidelity = f
    const s = total.chsh()
    if (s !== undefined) c.chsh = s
    if (usesChsh || usesTest) {
      c.testRounds = total.testRounds
      c.testErrors = total.testErrors
      c.bellDetected = bellDetected(total) ?? false
    }
    return c
  }

  const finishTrial = (): Trial => {
    const t: Trial = {
      index: trialsDone,
      qber: trial.qber(),
      eveKnows: trial.eveKnows(),
      detected: trial.sifted > 0 && trial.qber() > threshold,
    }
    const s = trial.chsh()
    if (s !== undefined) t.chsh = s
    const f = trial.fidelity()
    if (f !== undefined) t.fidelity = f
    const b = bellDetected(trial)
    if (b !== undefined) t.bellDetected = b
    trialsDone++
    trial = new Acc()
    return t
  }

  return {
    params,
    step(n: number): Batch {
      const trials: Trial[] = []
      const paths: Path[] = []
      const k = Math.min(n, 8) // sample exactly k rounds, evenly spaced
      for (let i = 0; i < n; i++) {
        const x = runner.round()
        if (x.chsh) usesChsh = true
        if (x.test) usesTest = true
        total.push(x)
        trial.push(x)
        if (Math.floor((i * k) / n) > Math.floor(((i - 1) * k) / n)) {
          const outcome: Path['outcome'] = x.eve ? 'eve' : x.error ? 'error' : 'ok'
          paths.push(makePath(pr, outcome))
        }
        if (trial.shots >= roundsPerTrial) trials.push(finishTrial())
      }
      const batch: Batch = { counters: counters(), trials, paths }
      if (runner.note) batch.note = runner.note
      return batch
    },
    counters,
    reset(): void {
      r = rng(params.seed)
      pr = rng(params.seed ^ 0x5bd1e995)
      runner = build(r, params)
      total = new Acc()
      trial = new Acc()
      trialsDone = 0
      usesChsh = false
      usesTest = false
    },
  }
}
