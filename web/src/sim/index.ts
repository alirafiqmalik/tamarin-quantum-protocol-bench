/**
 * Browser quantum-protocol simulator: deterministic, incremental, framework-free.
 * See docs/SIM.md for the physics and the simplifications.
 */

import { BB84_ROUNDS_PER_TRIAL, BB84_STRATEGIES, createBb84 } from './bb84.ts'
import { EBQKD_ROUNDS_PER_TRIAL, EBQKD_STRATEGIES, createEbqkd } from './ebqkd.ts'
import { TELEPORT_ROUNDS_PER_TRIAL, TELEPORT_STRATEGIES, createTeleport } from './teleport.ts'
import { SUPERDENSE_ROUNDS_PER_TRIAL, SUPERDENSE_STRATEGIES, createSuperdense } from './superdense.ts'
import { CKA_ROUNDS_PER_TRIAL, CKA_STRATEGIES, QSS_ROUNDS_PER_TRIAL, QSS_STRATEGIES, createCka, createQss } from './ghz.ts'
import type { Experiment, ProtocolId, ProtocolInfo, SimApi, SimParams } from './types.ts'

export type * from './types.ts'
export { rng } from './rng.ts'
export { QState, bell, ghz, haarQubit } from './qstate.ts'
export { createBb84, bb84Mode } from './bb84.ts'
export { createEbqkd, ebqkdMode } from './ebqkd.ts'
export { createTeleport, teleportMode } from './teleport.ts'
export { createSuperdense, superdenseMode } from './superdense.ts'
export { createQss, createCka, qssMode, ckaMode } from './ghz.ts'

export const protocols: ProtocolInfo[] = [
  { id: 'bb84', label: 'BB84 (prepare-and-measure QKD)', strategies: BB84_STRATEGIES,
    schedule: ['basisOrder', 'commitment', 'authenticated', 'identityBound'], roundsPerTrial: BB84_ROUNDS_PER_TRIAL },
  { id: 'ebqkd', label: 'BBM92 / E91 (entanglement-based QKD)', strategies: EBQKD_STRATEGIES,
    schedule: ['commitment'], roundsPerTrial: EBQKD_ROUNDS_PER_TRIAL },
  { id: 'teleport', label: 'Quantum teleportation', strategies: TELEPORT_STRATEGIES,
    schedule: ['authenticated'], roundsPerTrial: TELEPORT_ROUNDS_PER_TRIAL },
  { id: 'superdense', label: 'Superdense coding', strategies: SUPERDENSE_STRATEGIES,
    schedule: [], roundsPerTrial: SUPERDENSE_ROUNDS_PER_TRIAL },
  { id: 'qss', label: 'Quantum secret sharing (HBB99, GHZ)', strategies: QSS_STRATEGIES,
    schedule: ['dealerOrder'], roundsPerTrial: QSS_ROUNDS_PER_TRIAL },
  { id: 'cka', label: 'Conference key agreement (GHZ)', strategies: CKA_STRATEGIES,
    schedule: ['identityBound', 'authenticated'], roundsPerTrial: CKA_ROUNDS_PER_TRIAL },
]

const factories: Record<ProtocolId, (p: SimParams) => Experiment> = {
  bb84: createBb84,
  ebqkd: createEbqkd,
  teleport: createTeleport,
  superdense: createSuperdense,
  qss: createQss,
  cka: createCka,
}

/** Fill in defaults so views can pass partial parameters. */
export function normalizeParams(p: Partial<SimParams> & Pick<SimParams, 'protocol'>): SimParams {
  const noise = Number.isFinite(p.noise) ? Math.min(0.5, Math.max(0, p.noise as number)) : 0
  return {
    protocol: p.protocol,
    strategy: p.strategy ?? 'none',
    schedule: p.schedule ?? {},
    noise,
    threshold: Number.isFinite(p.threshold) ? (p.threshold as number) : 0.1,
    seed: Number.isFinite(p.seed) ? (p.seed as number) : 1,
  }
}

export function create(params: SimParams): Experiment {
  const factory = factories[params.protocol]
  if (!factory) throw new Error(`unknown protocol ${String(params.protocol)}`)
  return factory(normalizeParams(params))
}

export function protocolInfo(id: ProtocolId): ProtocolInfo | undefined {
  return protocols.find((p) => p.id === id)
}

export const sim: SimApi = { protocols, create }

export default sim
