/** Classify unified diff lines for rendering. Pure helper. */
export type DiffKind = 'add' | 'del' | 'hunk' | 'file' | 'context'
export interface DiffLine { kind: DiffKind; text: string }

export function classifyDiff(lines: string[]): DiffLine[] {
  return lines.map((text) => {
    if (text.startsWith('+++') || text.startsWith('---')) return { kind: 'file', text }
    if (text.startsWith('@@')) return { kind: 'hunk', text }
    if (text.startsWith('+')) return { kind: 'add', text }
    if (text.startsWith('-')) return { kind: 'del', text }
    return { kind: 'context', text }
  })
}

export interface DiffStats { added: number; removed: number; hunks: number }

export function diffStats(lines: DiffLine[]): DiffStats {
  const stats: DiffStats = { added: 0, removed: 0, hunks: 0 }
  for (const line of lines) {
    if (line.kind === 'add') stats.added += 1
    else if (line.kind === 'del') stats.removed += 1
    else if (line.kind === 'hunk') stats.hunks += 1
  }
  return stats
}

/** Rule names touched by a diff, from `rule Name:` lines that were added or removed. */
export function changedRules(lines: DiffLine[]): string[] {
  const names = new Set<string>()
  for (const line of lines) {
    if (line.kind !== 'add' && line.kind !== 'del') continue
    const m = /^[+-]\s*(?:rule|lemma|restriction)\s+([A-Za-z0-9_]+)/.exec(line.text)
    if (m) names.add(m[1])
  }
  return [...names]
}
