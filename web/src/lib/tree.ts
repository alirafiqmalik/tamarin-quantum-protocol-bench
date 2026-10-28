/** Layered tree layout for proof.order (pre-order list with parent indices). Pure. */
import type { ProofNode } from './api'

export interface LaidNode extends ProofNode {
  x: number // 0..1
  y: number // 0..1
  leaf: boolean
}

export interface TreeLayout {
  nodes: LaidNode[]
  edges: Array<[number, number]> // [parent, child]
  depth: number
  leaves: number
}

/**
 * Leaves are spaced evenly left to right in pre-order; an inner node sits at the
 * mean x of its children. y is depth / maxDepth.
 */
export function layoutTree(order: ProofNode[]): TreeLayout {
  const n = order.length
  if (n === 0) return { nodes: [], edges: [], depth: 0, leaves: 0 }
  const children = new Map<number, number[]>()
  const edges: Array<[number, number]> = []
  for (const node of order) {
    if (node.p != null) {
      edges.push([node.p, node.i])
      const list = children.get(node.p) ?? []
      list.push(node.i)
      children.set(node.p, list)
    }
  }
  const xs = new Map<number, number>()
  let leafCount = 0
  const roots = order.filter((nd) => nd.p == null).map((nd) => nd.i)
  const place = (i: number): number => {
    const kids = children.get(i) ?? []
    if (kids.length === 0) {
      const x = leafCount
      leafCount += 1
      xs.set(i, x)
      return x
    }
    const sum = kids.reduce((acc, k) => acc + place(k), 0)
    const x = sum / kids.length
    xs.set(i, x)
    return x
  }
  roots.forEach(place)
  const maxDepth = Math.max(...order.map((nd) => nd.d))
  const denomX = Math.max(1, leafCount - 1)
  const nodes: LaidNode[] = order.map((nd) => ({
    ...nd,
    x: leafCount <= 1 ? 0.5 : (xs.get(nd.i) ?? 0) / denomX,
    y: maxDepth === 0 ? 0.5 : nd.d / maxDepth,
    leaf: (children.get(nd.i) ?? []).length === 0,
  }))
  return { nodes, edges, depth: maxDepth, leaves: leafCount }
}

export type NodeTone = 'closed' | 'trace' | 'open' | 'neutral'

/** Color class for a node given the overall lemma outcome. */
export function nodeTone(node: ProofNode, outcome: 'verified' | 'falsified' | 'other', leaf: boolean): NodeTone {
  if (leaf && outcome === 'falsified' && (node.status === 'trace' || node.kind === 'leaf')) return 'trace'
  if (node.status === 'closed' || node.status === 'contradiction') return 'closed'
  if (outcome === 'verified') return 'closed'
  if (node.status === 'open') return 'open'
  return 'neutral'
}
