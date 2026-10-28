export { fmtInt, fmtPct, fmtSeconds } from './takeaway'

export function shortHash(hash: string | undefined | null, n = 10): string {
  if (!hash) return '–'
  return hash.slice(0, n)
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '–'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export function optionsMatch(a: Record<string, unknown>, b: Record<string, unknown>, keys?: string[]): boolean {
  const ks = keys ?? Object.keys(a)
  return ks.every((k) => a[k] === b[k])
}
