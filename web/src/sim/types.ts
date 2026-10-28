/**
 * Contract between the browser simulator (web/src/sim) and the views.
 * The simulator is deterministic for a given seed and runs incrementally:
 * the view calls step(n) once per animation frame and renders the counters.
 */

export type ProtocolId = 'bb84' | 'ebqkd' | 'teleport' | 'superdense' | 'qss' | 'cka'

/** Attacker strategies. Not every strategy applies to every protocol. */
export type Strategy =
  | 'none'              // honest run, optional noise
  | 'intercept-resend'  // measure in a random basis, resend
  | 'v1-injection'      // EB: attacker-controlled source, measures her half after the basis announcement
  | 'v2-deferred'       // PM: wait for Alice's basis announcement, then measure and resend
  | 'v3-reflection'     // classical only: unbound MAC lets a party talk to itself
  | 'tamper-classical'  // teleport: flip the correction bits on an unauthenticated channel
  | 'untrusted-source'  // teleport/superdense: attacker prepares the entangled pair
  | 'dishonest-party'   // qss/cka: one insider deviates

/** Classical control schedule knobs that mirror the symbolic model switches. */
export interface Schedule {
  /** PM: who announces the basis first. 'A2B' Alice first, 'B2A' Bob first, 'none' no ordering. */
  basisOrder?: 'A2B' | 'B2A' | 'none'
  /** QSS: dealer announces first or last. */
  dealerOrder?: 'first' | 'last'
  /** Whether the classical channel is authenticated (MAC) for this run. */
  authenticated?: boolean
  /** Whether the MAC input binds sender and receiver identities (CM2). */
  identityBound?: boolean
  /** Whether a measurement commitment precedes basis announcement (CM1). */
  commitment?: boolean
}

export interface SimParams {
  protocol: ProtocolId
  strategy: Strategy
  schedule: Schedule
  /** Depolarizing noise probability per qubit on the honest channel, 0..0.5. */
  noise: number
  /** Detection threshold on the error rate, default 0.10. */
  threshold: number
  seed: number
}

/** Running totals since the experiment started. */
export interface Counters {
  shots: number          // rounds (qubits or pairs) processed
  sifted: number         // rounds kept after sifting / successful decodes
  errors: number         // errors inside the sifted rounds
  qber: number           // errors / sifted (0 when sifted is 0)
  eveBits: number        // sifted rounds whose value the attacker knows
  eveKnows: number       // eveBits / sifted
  detected: boolean      // qber > threshold so far
  fidelity?: number      // teleport: mean fidelity of Bob's state
  chsh?: number          // ebqkd: CHSH S estimate on the test rounds
  trials: number         // completed trials (for the histogram)
  /** ebqkd / cka: number of Bell (CHSH) or parity test rounds so far. */
  testRounds?: number
  /** cka: X-basis parity failures among the test rounds (ebqkd reports S instead). */
  testErrors?: number
  /**
   * ebqkd: CHSH S < 2 after enough test rounds; cka: parity error rate above threshold.
   * Separate from `detected` (which is the QBER check only) so the UI can show
   * that only a Bell test, not QBER, notices an injected product state.
   */
  bellDetected?: boolean
}

/** One completed trial, e.g. a key of N sifted bits. */
export interface Trial {
  index: number
  qber: number
  chsh?: number
  fidelity?: number
  eveKnows: number
  detected: boolean
  bellDetected?: boolean
}

/** One lit path in the "space of executions" picture: a shot drawn as a short polyline. */
export interface Path {
  points: Array<[number, number]>  // normalized 0..1 coordinates
  outcome: 'ok' | 'error' | 'eve'
}

export interface Batch {
  counters: Counters
  trials: Trial[]        // trials completed during this step
  paths: Path[]          // a few sampled paths for the picture (at most ~8 per step)
  /** Short human text explaining what the attacker did in this batch, if anything. */
  note?: string
}

export interface Experiment {
  readonly params: SimParams
  /** Process n more rounds. Deterministic for the seed. */
  step(n: number): Batch
  /** Totals so far. */
  counters(): Counters
  reset(): void
}

export interface StrategyInfo {
  id: Strategy
  label: string
  /** One sentence shown in the UI. */
  blurb: string
  /** Which symbolic vulnerability this maps to, if any: 'V1' | 'V2' | 'V3' | null. */
  maps: 'V1' | 'V2' | 'V3' | null
}

export interface ProtocolInfo {
  id: ProtocolId
  label: string
  strategies: StrategyInfo[]
  /** Schedule knobs this protocol uses. */
  schedule: Array<keyof Schedule>
  /** Rounds per trial used for the histogram. */
  roundsPerTrial: number
}

/** Factory implemented by web/src/sim/index.ts */
export interface SimApi {
  protocols: ProtocolInfo[]
  create(params: SimParams): Experiment
}
