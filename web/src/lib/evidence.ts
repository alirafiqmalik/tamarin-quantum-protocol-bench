/** Evidence-matrix helpers: grouping, verdict classes, attribution. Pure. */
import type { EvidenceSummary, Expectation, LemmaMeta, Options, Protocol } from './api'
import { optionsMatch } from './format'

export type CellState = 'verified' | 'falsified' | 'timeout' | 'inconclusive' | 'none'

export function cellState(r: EvidenceSummary | undefined): CellState {
  if (!r) return 'none'
  if (r.timed_out || /timeout|timed out/i.test(r.status)) return 'timeout'
  if (r.verified) return 'verified'
  if (/falsified/i.test(r.status)) return 'falsified'
  return 'inconclusive'
}

export interface MatrixRow {
  label: string
  options: Options
  cells: Record<string, EvidenceSummary | undefined>
}
export interface MatrixGroup {
  protocol: string
  lemmas: string[]
  rows: MatrixRow[]
}

export function buildMatrix(records: EvidenceSummary[], protocols: Protocol[]): MatrixGroup[] {
  const byProtocol = new Map<string, EvidenceSummary[]>()
  for (const r of records) {
    const list = byProtocol.get(r.protocol) ?? []
    list.push(r)
    byProtocol.set(r.protocol, list)
  }
  const groups: MatrixGroup[] = []
  const order = protocols.map((p) => p.id)
  const ids = [...byProtocol.keys()].sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
  })
  for (const pid of ids) {
    const list = byProtocol.get(pid) ?? []
    const proto = protocols.find((p) => p.id === pid)
    const known = (proto?.lemmas ?? []).map((l) => l.name)
    const extra = [...new Set(list.map((r) => r.lemma))].filter((n) => !known.includes(n)).sort()
    const lemmas = [...known.filter((n) => list.some((r) => r.lemma === n)), ...extra]
    const rows = new Map<string, MatrixRow>()
    for (const r of list) {
      const row = rows.get(r.label) ?? { label: r.label, options: r.options, cells: {} }
      const prev = row.cells[r.lemma]
      // keep the most recent record per cell
      if (!prev || (r.recorded ?? '') > (prev.recorded ?? '')) row.cells[r.lemma] = r
      rows.set(r.label, row)
    }
    groups.push({ protocol: pid, lemmas, rows: [...rows.values()].sort((a, b) => a.label.localeCompare(b.label)) })
  }
  return groups
}

export type Attribution = 'V1' | 'V2' | 'V3'

/** Countermeasure tag of a qkd record, matching the catalog expectations. */
export function cmTag(options: Options): string {
  const cm1 = Boolean(options.cm1)
  const cm2 = Boolean(options.cm2)
  if (cm1 && cm2) return 'CM1+CM2'
  if (cm1) return 'CM1'
  if (cm2) return 'CM2'
  return 'baseline'
}

const OPTION_KEYS = ['type', 'bo', 'er', 'adv'] as const

/** The catalog expectation that applies to a record, if any. */
export function expectationFor(r: EvidenceSummary | undefined, protocol: Protocol | undefined): Expectation | null {
  if (!r || !protocol?.expectations) return null
  for (const e of protocol.expectations) {
    if (e.lemma && e.lemma !== r.lemma) continue
    if (e.match && !optionsMatch(e.match, r.options, Object.keys(e.match))) continue
    let ok = true
    for (const k of OPTION_KEYS) {
      const want = e[k as keyof Expectation]
      if (want != null && String(r.options[k]) !== String(want)) ok = false
    }
    if (!ok) continue
    if (e.cm != null && e.cm !== cmTag(r.options)) continue
    return e
  }
  return null
}

/**
 * Attribution of a falsified lemma to the published vulnerabilities.
 * Prefers catalog data (`protocol.expectations`, then `lemma.attribution`);
 * falls back to the structural heuristic from the QVerify paper for `qkd`.
 */
export function attribution(r: EvidenceSummary | undefined, protocol: Protocol | undefined): { tag: Attribution; source: 'catalog' | 'heuristic' } | null {
  if (!r || cellState(r) !== 'falsified') return null
  const e = expectationFor(r, protocol)
  if (e) {
    const tag = e.vuln ?? e.attribution ?? null
    if (tag) return { tag, source: 'catalog' }
  }
  const meta: LemmaMeta | undefined = protocol?.lemmas.find((l) => l.name === r.lemma)
  if (meta?.attribution) return { tag: meta.attribution, source: 'catalog' }
  if (r.protocol !== 'qkd') return null
  if (/agreement|aliveness/.test(r.lemma)) return { tag: 'V3', source: 'heuristic' }
  if (/secret/.test(r.lemma)) {
    if (r.options.type === 'EB') return { tag: 'V1', source: 'heuristic' }
    if (r.options.type === 'PM') return { tag: 'V2', source: 'heuristic' }
  }
  return null
}

/** 'agrees' | 'disagrees' with the paper's verdict, or null when there is no expectation or no verdict. */
export function paperAgreement(r: EvidenceSummary | undefined, protocol: Protocol | undefined): 'agrees' | 'disagrees' | null {
  const e = expectationFor(r, protocol)
  if (!e?.paper || !r) return null
  const st = cellState(r)
  if (st !== 'verified' && st !== 'falsified') return null
  return st === e.paper ? 'agrees' : 'disagrees'
}

/**
 * Records matching a protocol, options (on the given keys) and a lemma, most
 * recent first. Re-runs of the same model (same lemma and theory hash) are
 * folded into their latest record.
 */
export function findRecords(records: EvidenceSummary[], protocol: string, options: Options, lemma: string | null, keys?: string[]): EvidenceSummary[] {
  const ks = keys ?? Object.keys(options).filter((k) => typeof options[k] === 'string')
  const sorted = records
    .filter((r) => r.protocol === protocol && (!lemma || r.lemma === lemma) && optionsMatch(options, r.options, ks))
    .sort((a, b) => (b.recorded ?? '').localeCompare(a.recorded ?? ''))
  const seen = new Set<string>()
  return sorted.filter((r) => {
    const key = `${r.lemma}|${r.hash}|${r.status}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
