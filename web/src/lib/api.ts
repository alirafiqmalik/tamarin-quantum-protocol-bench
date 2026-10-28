/**
 * Typed client for the bench HTTP API (docs/API.md) with the archive fallback.
 *
 * Live mode talks to app.py (proxied under /api in dev, same origin in prod).
 * Archive mode is used when GET /api/catalog fails: the page then loads the
 * static snapshot /catalog.json and /evidence/index.json and replays records
 * from /evidence/<path>. Live verification is unavailable in archive mode.
 */
import { parseSseChunks, type SseEvent } from './sse'

// ---- catalog -----------------------------------------------------------------

export interface FieldOption { id: string; label: string }
export interface Field {
  key: string
  label: string
  kind: 'choice' | 'bool'
  default?: string | boolean
  options?: FieldOption[]
}
export interface LemmaMeta {
  name: string
  kind: 'all-traces' | 'exists-trace' | string
  title?: string
  desc?: string
  flag?: string | null
  /** Optional attribution of the expected counterexample (tolerated if absent). */
  attribution?: 'V1' | 'V2' | 'V3' | null
}
export interface Preset { id: string; label: string; options: Options; story?: string }
export interface Standard { clause: string; text: string }
/**
 * Optional expectation entries from the paper (tolerated if absent). The qkd
 * catalog uses the flat shape: option keys (type, bo, er), a countermeasure tag
 * `cm` ('baseline' | 'CM1' | 'CM2' | 'CM1+CM2'), `lemma`, the paper's verdict and
 * the attributed vulnerability. The generic `match`/`attribution` shape is also
 * accepted.
 */
export interface Expectation {
  /** Generic shape. */
  match?: Options
  attribution?: 'V1' | 'V2' | 'V3' | null
  note?: string
  /** Flat qkd shape. */
  type?: string
  bo?: string
  er?: string
  cm?: string
  lemma?: string
  paper?: 'verified' | 'falsified' | string
  vuln?: 'V1' | 'V2' | 'V3' | null
  source?: string
}
export type Options = Record<string, string | boolean>
export type LaneSpec = [string, string[]]

export interface Protocol {
  id: string
  name: string
  group: string
  blurb?: string
  story?: string
  fields: Field[]
  lemmas: LemmaMeta[]
  presets?: Preset[]
  standards?: Standard[]
  lanes?: LaneSpec[]
  expectations?: Expectation[]
}
export interface Group { id: string; name: string; blurb?: string }
export interface Catalog { heuristics: string[]; groups: Group[]; protocols: Protocol[] }

export interface Environment {
  tamarin?: string
  python?: string
  platform?: string
  cpus?: number
}

// ---- results -----------------------------------------------------------------

export type ProofKind = 'lemma' | 'simplify' | 'induction' | 'solve' | 'case' | 'leaf' | string
export type ProofStatus = 'trace' | 'closed' | 'open' | 'mixed' | string
export interface ProofNode { i: number; p: number | null; d: number; kind: ProofKind; label: string; status: ProofStatus }
export interface Proof { size: number; depth: number; status: ProofStatus; order: ProofNode[] }

export type Channel = 'quantum' | 'classical-auth' | 'public' | 'state' | string
export interface TraceEvent {
  id: string
  t: number
  lane: string
  rule: string
  kind: 'rule' | 'attacker' | string
  actions: string[]
  violation: boolean
}
export interface TraceMessage {
  from: string
  to: string
  fromLane: string
  toLane: string
  t: number
  fact: string
  label: string
  full: string
  channel: Channel
  relation: string
}
export interface Trace {
  label: string
  lanes: string[]
  size: number
  events: TraceEvent[]
  messages: TraceMessage[]
  violation: string[]
}

export interface LemmaResult {
  name: string
  quantifier: 'all-traces' | 'exists-trace' | string
  status: string
  verified: boolean
  steps: number | null
  proof?: Proof | null
  trace?: Trace | null
}

export interface VerifyResult {
  key?: string
  label: string
  heuristic: string
  lemma: string | null
  version: string
  hash: string
  seconds: number | null
  wall?: number | null
  timed_out: boolean
  warning?: boolean
  cached: boolean
  log?: string
  lemmas: LemmaResult[]
}

export interface VerifyRequest {
  protocol: string
  options?: Options
  heuristic?: string
  timeout?: number
  lemma?: string | null
  theory?: string
}

export interface AssembleResult { theory: string; label: string; lemmas: string[]; options: Options }
export interface DiffResult { a: string; b: string; diff: string[] }

// ---- evidence ----------------------------------------------------------------

export interface EvidenceSummary {
  id: string
  protocol: string
  options: Options
  label: string
  lemma: string
  heuristic: string
  status: string
  verified: boolean
  steps: number | null
  seconds: number | null
  timed_out: boolean
  hash: string
  recorded: string
  path: string
}
export interface EvidenceIndex {
  environment: Environment
  updated: string | null
  records: Record<string, EvidenceSummary>
}
export interface EvidenceRecord extends EvidenceSummary {
  quantifier?: string
  wall?: number | null
  version?: string
  proof?: Proof | null
  trace?: Trace | null
  log?: string
  theory_file?: string
}

/** Where the data comes from. */
export type Mode = 'live' | 'archive'

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new ApiError(`Bad JSON from ${res.url || 'server'} (${res.status})`, res.status)
  }
  if (!res.ok) {
    const err = (data as { error?: string } | null)?.error
    throw new ApiError(err || res.statusText || `HTTP ${res.status}`, res.status)
  }
  return data as T
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } })
  return readJson<T>(res)
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  return readJson<T>(res)
}

// ---- bootstrap: live or archive --------------------------------------------

export interface Boot {
  mode: Mode
  catalog: Catalog
  environment: Environment
  evidence: EvidenceIndex
  /** Why live mode was not available (archive mode only). */
  reason?: string
}

const EMPTY_INDEX: EvidenceIndex = { environment: {}, updated: null, records: {} }

/**
 * Try the live server first. If /api/catalog is unreachable, fall back to the
 * static snapshot (/catalog.json + /evidence/index.json).
 */
export async function boot(): Promise<Boot> {
  let reason = ''
  try {
    const catalog = await getJson<Catalog>('/api/catalog')
    const [environment, evidence] = await Promise.all([
      getJson<Environment>('/api/environment').catch(() => ({}) as Environment),
      getJson<EvidenceIndex>('/api/evidence').catch(() => EMPTY_INDEX),
    ])
    return { mode: 'live', catalog, environment: { ...evidence.environment, ...environment }, evidence }
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err)
  }
  const catalog = await getJson<Catalog>('/catalog.json')
  const evidence = await getJson<EvidenceIndex>('/evidence/index.json').catch(() => EMPTY_INDEX)
  return { mode: 'archive', catalog, environment: evidence.environment || {}, evidence, reason }
}

// ---- endpoints ---------------------------------------------------------------

export const api = {
  catalog: () => getJson<Catalog>('/api/catalog'),
  environment: () => getJson<Environment>('/api/environment'),
  evidence: () => getJson<EvidenceIndex>('/api/evidence'),
  assemble: (protocol: string, options: Options) => postJson<AssembleResult>('/api/assemble', { protocol, options }),
  diff: (protocol: string, a: Options, b: Options) => postJson<DiffResult>('/api/diff', { protocol, a, b }),
  verify: (req: VerifyRequest) => postJson<VerifyResult>('/api/verify', { ...req, stream: false }),
}

/** Load one full evidence record in either mode. */
export async function loadRecord(mode: Mode, summary: EvidenceSummary): Promise<EvidenceRecord> {
  if (mode === 'live') return getJson<EvidenceRecord>(`/api/evidence/${encodeURIComponent(summary.id)}`)
  return getJson<EvidenceRecord>(`/evidence/${summary.path}`)
}

// ---- streaming verify --------------------------------------------------------

export interface StreamHandlers {
  onStatus?: (status: { label: string; timeout: number }) => void
  onLog?: (line: string) => void
  onTick?: () => void
  onResult?: (result: VerifyResult) => void
  onError?: (message: string) => void
}

/**
 * POST /api/verify with stream:true and dispatch the SSE events as they arrive.
 * Resolves with the result, rejects on error events, HTTP errors, or abort.
 */
export async function verifyStream(req: VerifyRequest, handlers: StreamHandlers, signal?: AbortSignal): Promise<VerifyResult> {
  const res = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ ...req, stream: true }),
    signal,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError((data as { error?: string }).error || res.statusText, res.status)
  }
  if (!res.body) throw new ApiError('No response body for the event stream.')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: VerifyResult | null = null
  let failure: string | null = null

  const dispatch = (ev: SseEvent) => {
    let data: unknown = null
    try {
      data = ev.data ? JSON.parse(ev.data) : null
    } catch {
      data = null
    }
    switch (ev.event) {
      case 'status':
        handlers.onStatus?.(data as { label: string; timeout: number })
        break
      case 'log':
        handlers.onLog?.(String((data as { line?: string } | null)?.line ?? ''))
        break
      case 'tick':
        handlers.onTick?.()
        break
      case 'result':
        result = data as VerifyResult
        handlers.onResult?.(result)
        break
      case 'error':
        failure = String((data as { error?: string } | null)?.error ?? 'Unknown error')
        handlers.onError?.(failure)
        break
      default:
        break
    }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const { events, rest } = parseSseChunks(buffer)
    buffer = rest
    events.forEach(dispatch)
  }
  buffer += decoder.decode()
  if (buffer.trim()) {
    const { events } = parseSseChunks(buffer + '\n\n')
    events.forEach(dispatch)
  }
  if (failure) throw new ApiError(failure)
  if (!result) throw new ApiError('The stream ended without a result.')
  return result
}
