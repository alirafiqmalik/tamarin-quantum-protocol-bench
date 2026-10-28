import { describe, expect, it } from 'vitest'
import type { ProofNode } from './api'
import { layoutTree } from './tree'

const order: ProofNode[] = [
  { i: 0, p: null, d: 0, kind: 'lemma', label: '', status: 'closed' },
  { i: 1, p: 0, d: 1, kind: 'simplify', label: '', status: 'closed' },
  { i: 2, p: 1, d: 2, kind: 'case', label: 'c1', status: 'closed' },
  { i: 3, p: 1, d: 2, kind: 'case', label: 'c2', status: 'closed' },
]

describe('layoutTree', () => {
  it('spaces leaves evenly and centers parents', () => {
    const t = layoutTree(order)
    expect(t.leaves).toBe(2)
    expect(t.depth).toBe(2)
    expect(t.nodes[2].x).toBe(0)
    expect(t.nodes[3].x).toBe(1)
    expect(t.nodes[1].x).toBe(0.5)
    expect(t.nodes[0].y).toBe(0)
    expect(t.nodes[3].y).toBe(1)
    expect(t.edges).toEqual([[0, 1], [1, 2], [1, 3]])
  })
  it('handles empty and single-node trees', () => {
    expect(layoutTree([]).nodes).toEqual([])
    const one = layoutTree([order[0]])
    expect(one.nodes[0]).toMatchObject({ x: 0.5, y: 0.5, leaf: true })
  })
})
