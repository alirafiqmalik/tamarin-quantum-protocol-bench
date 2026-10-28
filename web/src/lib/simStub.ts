/**
 * Fallback simulator used only when web/src/sim/index.ts is absent. It produces
 * plausible numbers (honest ~ noise, intercept-resend ~ 25 %, V1/V2 ~ 0 % with
 * full attacker knowledge, V3 classical only) so the views can be exercised.
 * It is not the physics model; the real module replaces it automatically.
 */
import type { Batch, Counters, Experiment, Path, ProtocolInfo, SimApi, SimParams, Strategy, Trial } from '../sim/types'

function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const strategyInfo = (id: Strategy, label: string, blurb: string, maps: 'V1' | 'V2' | 'V3' | null) => ({ id, label, blurb, maps })

const protocols: ProtocolInfo[] = [
  {
    id: 'bb84',
    label: 'BB84 (prepare and measure)',
    roundsPerTrial: 256,
    schedule: ['basisOrder', 'authenticated', 'identityBound', 'commitment'],
    strategies: [
      strategyInfo('none', 'None (honest, noise)', 'Honest devices with optional depolarizing noise.', null),
      strategyInfo('intercept-resend', 'Intercept and resend', 'Eve measures each qubit in a random basis and resends. About 25 % errors.', null),
      strategyInfo('v2-deferred', 'V2 basis-deferred measurement', 'Eve holds the qubit until Alice announces the basis, then measures. No errors.', 'V2'),
      strategyInfo('v3-reflection', 'V3 message reflection', 'Classical only: an unbound MAC lets Eve reflect announcements. No quantum trace.', 'V3'),
    ],
  },
  {
    id: 'ebqkd',
    label: 'BBM92 / E91 (entanglement based)',
    roundsPerTrial: 256,
    schedule: ['authenticated', 'identityBound', 'commitment'],
    strategies: [
      strategyInfo('none', 'None (honest, noise)', 'Honest source with optional noise.', null),
      strategyInfo('intercept-resend', 'Intercept and resend', 'Eve measures Bob\'s half and resends. About 25 % errors.', null),
      strategyInfo('v1-injection', 'V1 subverted entanglement', 'Eve supplies the pairs and measures her copy after the announcement. No errors.', 'V1'),
      strategyInfo('v3-reflection', 'V3 message reflection', 'Classical only: an unbound MAC lets Eve reflect announcements.', 'V3'),
    ],
  },
  {
    id: 'teleport',
    label: 'Teleportation',
    roundsPerTrial: 128,
    schedule: ['authenticated'],
    strategies: [
      strategyInfo('none', 'None', 'Honest run.', null),
      strategyInfo('tamper-classical', 'Tamper with corrections', 'Flip the classical correction bits.', null),
      strategyInfo('untrusted-source', 'Untrusted source', 'The attacker prepares the pair.', null),
    ],
  },
  {
    id: 'superdense',
    label: 'Superdense coding',
    roundsPerTrial: 128,
    schedule: ['authenticated'],
    strategies: [strategyInfo('none', 'None', 'Honest run.', null), strategyInfo('untrusted-source', 'Untrusted source', 'The attacker prepares the pair.', null)],
  },
  {
    id: 'qss',
    label: 'Quantum secret sharing',
    roundsPerTrial: 128,
    schedule: ['dealerOrder'],
    strategies: [strategyInfo('none', 'None', 'Honest run.', null), strategyInfo('dishonest-party', 'Dishonest party', 'One insider deviates.', null)],
  },
  {
    id: 'cka',
    label: 'Conference key agreement',
    roundsPerTrial: 128,
    schedule: ['identityBound'],
    strategies: [strategyInfo('none', 'None', 'Honest run.', null), strategyInfo('dishonest-party', 'Dishonest party', 'One insider deviates.', null)],
  },
]

class StubExperiment implements Experiment {
  readonly params: SimParams
  private rand: () => number
  private c: Counters
  private trialRounds = 0
  private trialErrors = 0
  private trialEve = 0
  private trialSifted = 0
  private readonly perTrial: number

  constructor(params: SimParams) {
    this.params = params
    this.rand = mulberry(params.seed)
    this.perTrial = protocols.find((p) => p.id === params.protocol)?.roundsPerTrial ?? 256
    this.c = this.fresh()
  }

  private fresh(): Counters {
    const base: Counters = { shots: 0, sifted: 0, errors: 0, qber: 0, eveBits: 0, eveKnows: 0, detected: false, trials: 0 }
    if (this.params.protocol === 'ebqkd') base.chsh = 2.82
    if (this.params.protocol === 'teleport') base.fidelity = 1
    return base
  }

  counters(): Counters {
    return { ...this.c }
  }

  reset(): void {
    this.rand = mulberry(this.params.seed)
    this.c = this.fresh()
    this.trialRounds = this.trialErrors = this.trialEve = this.trialSifted = 0
  }

  private errorRate(): number {
    const s = this.params.strategy
    const noise = this.params.noise * (2 / 3)
    if (s === 'intercept-resend') return 0.25 + noise
    if (s === 'tamper-classical') return 0.5
    if (s === 'untrusted-source' || s === 'dishonest-party') return noise
    return noise
  }

  private eveRate(): number {
    const s = this.params.strategy
    if (s === 'v1-injection' || s === 'v2-deferred' || s === 'untrusted-source') return 1
    if (s === 'intercept-resend') return 0.5
    if (s === 'dishonest-party') return 1
    return 0
  }

  step(n: number): Batch {
    const trials: Trial[] = []
    const paths: Path[] = []
    const sift = this.params.protocol === 'bb84' || this.params.protocol === 'ebqkd' ? 0.5 : 1
    const er = this.errorRate()
    const ev = this.eveRate()
    for (let k = 0; k < n; k += 1) {
      this.c.shots += 1
      this.trialRounds += 1
      let outcome: Path['outcome'] = 'ok'
      if (this.rand() < sift) {
        this.c.sifted += 1
        this.trialSifted += 1
        if (this.rand() < er) {
          this.c.errors += 1
          this.trialErrors += 1
          outcome = 'error'
        }
        if (this.rand() < ev) {
          this.c.eveBits += 1
          this.trialEve += 1
          if (outcome === 'ok') outcome = 'eve'
        }
      }
      if (paths.length < 6 && this.rand() < 6 / Math.max(n, 6)) {
        const pts: Array<[number, number]> = [[0.02, 0.03]]
        let x = 0.02
        let y = 0.03
        for (let s = 0; s < 7; s += 1) {
          x = Math.min(0.98, Math.max(0.02, x + (this.rand() - 0.3) * 0.25))
          y = Math.min(0.98, Math.max(0.02, y + (this.rand() - 0.3) * 0.25))
          pts.push([x, y])
        }
        paths.push({ points: pts, outcome })
      }
      if (this.trialRounds >= this.perTrial) {
        const q = this.trialSifted ? this.trialErrors / this.trialSifted : 0
        const ek = this.trialSifted ? this.trialEve / this.trialSifted : 0
        this.c.trials += 1
        const trial: Trial = { index: this.c.trials, qber: q, eveKnows: ek, detected: q > this.params.threshold }
        if (this.c.chsh != null) trial.chsh = this.c.chsh
        if (this.c.fidelity != null) trial.fidelity = 1 - q
        trials.push(trial)
        this.trialRounds = this.trialErrors = this.trialEve = this.trialSifted = 0
      }
    }
    this.c.qber = this.c.sifted ? this.c.errors / this.c.sifted : 0
    this.c.eveKnows = this.c.sifted ? this.c.eveBits / this.c.sifted : 0
    this.c.detected = this.c.qber > this.params.threshold && this.c.sifted > 32
    if (this.c.chsh != null) this.c.chsh = 2.82 * (1 - 2 * this.c.qber)
    if (this.c.fidelity != null) this.c.fidelity = 1 - this.c.qber
    const note = this.params.strategy === 'v3-reflection' ? 'V3 never touches the quantum channel; the simulator sees an honest run.' : undefined
    return { counters: this.counters(), trials, paths, note }
  }
}

export const stubSim: SimApi = {
  protocols,
  create: (params: SimParams) => new StubExperiment(params),
}
