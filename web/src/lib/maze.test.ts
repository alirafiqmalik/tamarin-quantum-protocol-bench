import { describe, expect, it } from 'vitest'
import { cellAt, coveredCells, makeMaze, routeTo, snapPath } from './maze'

describe('maze', () => {
  const m = makeMaze(12, 8, 3)
  it('reaches every cell from the entry in BFS order', () => {
    expect(m.order).toHaveLength(12 * 8)
    expect(new Set(m.order).size).toBe(12 * 8)
    expect(m.order[0]).toBe(0)
    for (let k = 1; k < m.order.length; k += 1) expect(m.depth[m.order[k]]).toBeGreaterThanOrEqual(m.depth[m.order[k - 1]])
  })
  it('routes along adjacent cells from the entry', () => {
    const target = cellAt(m, [0.99, 0.99])
    expect(target).toBe(12 * 8 - 1)
    const route = routeTo(m, target)
    expect(route[0]).toEqual([0.5, 0.5])
    expect(route[route.length - 1]).toEqual([11.5, 7.5])
    for (let k = 1; k < route.length; k += 1) {
      const d = Math.abs(route[k][0] - route[k - 1][0]) + Math.abs(route[k][1] - route[k - 1][1])
      expect(d).toBe(1)
    }
    expect(snapPath(m, [[0.1, 0.2], [0.99, 0.99]])).toEqual(route)
  })
  it('is deterministic for a seed and covers by fraction', () => {
    expect(makeMaze(12, 8, 3).open).toEqual(m.open)
    expect(coveredCells(m, 0.5)).toHaveLength(48)
    expect(coveredCells(m, 1)).toHaveLength(96)
  })
})
