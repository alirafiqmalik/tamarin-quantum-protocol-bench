/**
 * Loads the browser simulator (web/src/sim/index.ts, exporting `sim: SimApi`).
 * That module is built concurrently by another work package, so it is looked up
 * with import.meta.glob (an empty match is not a build error) and a tiny local
 * stub takes over when it is missing.
 */
import type { SimApi } from '../sim/types'
import { stubSim } from './simStub'

type SimModule = { sim?: SimApi; default?: SimApi }

const candidates = import.meta.glob<SimModule>('../sim/index.ts')

export interface LoadedSim {
  sim: SimApi
  /** true when the real module was found. */
  real: boolean
}

let cached: Promise<LoadedSim> | null = null

export function loadSim(): Promise<LoadedSim> {
  if (cached) return cached
  const loader = candidates['../sim/index.ts']
  cached = (async () => {
    if (!loader) return { sim: stubSim, real: false }
    try {
      const mod = await loader()
      const sim = mod.sim ?? mod.default
      if (sim && typeof sim.create === 'function' && Array.isArray(sim.protocols)) return { sim, real: true }
    } catch (err) {
      console.warn('simulator module failed to load, using the stub', err)
    }
    return { sim: stubSim, real: false }
  })()
  return cached
}

/** Catalog protocol + options -> simulator protocol id. */
export function simProtocolId(protocolId: string, options: Record<string, unknown>): import('../sim/types').ProtocolId | null {
  if (protocolId === 'qkd') return options.type === 'EB' ? 'ebqkd' : 'bb84'
  if (protocolId === 'teleport' || protocolId === 'teleportation') return 'teleport'
  if (protocolId === 'superdense') return 'superdense'
  if (protocolId === 'qss') return 'qss'
  if (protocolId === 'cka') return 'cka'
  return null
}
