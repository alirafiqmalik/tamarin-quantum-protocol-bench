/**
 * The "space of executions" picture: a faint maze-like grid. Both panels of
 * Station A draw the same maze; the simulator lights individual paths, the
 * proof covers the reachable cells in BFS order from the entry.
 */
export interface Maze {
  cols: number
  rows: number
  /** For each cell index, bitmask of open walls: 1=N 2=E 4=S 8=W. */
  open: Uint8Array
  /** BFS order of cell indices from the entry (top-left). */
  order: number[]
  /** Precomputed depth (BFS distance) per cell. */
  depth: Int32Array
  /** BFS parent per cell (-1 at the entry). */
  parent: Int32Array
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

/** Randomized DFS maze; deterministic for the seed. */
export function makeMaze(cols = 28, rows = 16, seed = 7): Maze {
  const rand = rng(seed)
  const open = new Uint8Array(cols * rows)
  const seen = new Uint8Array(cols * rows)
  const stack: number[] = [0]
  seen[0] = 1
  const dirs: Array<[number, number, number, number]> = [
    [0, -1, 1, 4],
    [1, 0, 2, 8],
    [0, 1, 4, 1],
    [-1, 0, 8, 2],
  ]
  while (stack.length) {
    const cur = stack[stack.length - 1]
    const cx = cur % cols
    const cy = Math.floor(cur / cols)
    const options = dirs.filter(([dx, dy]) => {
      const nx = cx + dx
      const ny = cy + dy
      return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[ny * cols + nx]
    })
    if (!options.length) {
      stack.pop()
      continue
    }
    const [dx, dy, bit, back] = options[Math.floor(rand() * options.length)]
    const nxt = (cy + dy) * cols + (cx + dx)
    open[cur] |= bit
    open[nxt] |= back
    seen[nxt] = 1
    stack.push(nxt)
  }
  // Knock a few extra walls so there are loops (more "paths" to light).
  for (let k = 0; k < Math.floor((cols * rows) / 9); k += 1) {
    const c = Math.floor(rand() * cols * rows)
    const cx = c % cols
    const cy = Math.floor(c / cols)
    const [dx, dy, bit, back] = dirs[Math.floor(rand() * 4)]
    const nx = cx + dx
    const ny = cy + dy
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
    open[c] |= bit
    open[ny * cols + nx] |= back
  }
  // BFS from the entry.
  const depth = new Int32Array(cols * rows).fill(-1)
  const parent = new Int32Array(cols * rows).fill(-1)
  const order: number[] = [0]
  depth[0] = 0
  for (let head = 0; head < order.length; head += 1) {
    const cur = order[head]
    const cx = cur % cols
    const cy = Math.floor(cur / cols)
    for (const [dx, dy, bit] of dirs) {
      if (!(open[cur] & bit)) continue
      const nxt = (cy + dy) * cols + (cx + dx)
      if (depth[nxt] !== -1) continue
      depth[nxt] = depth[cur] + 1
      parent[nxt] = cur
      order.push(nxt)
    }
  }
  return { cols, rows, open, order, depth, parent }
}

/** Wall segments of the maze as SVG path data, in unit cell coordinates. */
export function wallPath(m: Maze): string {
  const parts: string[] = []
  for (let y = 0; y < m.rows; y += 1) {
    for (let x = 0; x < m.cols; x += 1) {
      const o = m.open[y * m.cols + x]
      if (!(o & 1)) parts.push(`M${x} ${y}h1`)
      if (!(o & 8)) parts.push(`M${x} ${y}v1`)
      if (y === m.rows - 1 && !(o & 4)) parts.push(`M${x} ${y + 1}h1`)
      if (x === m.cols - 1 && !(o & 2)) parts.push(`M${x + 1} ${y}v1`)
    }
  }
  return parts.join('')
}

/** Cell index under a normalized point. */
export function cellAt(m: Maze, [px, py]: [number, number]): number {
  const cx = Math.min(m.cols - 1, Math.max(0, Math.floor(px * m.cols)))
  const cy = Math.min(m.rows - 1, Math.max(0, Math.floor(py * m.rows)))
  return cy * m.cols + cx
}

/** The corridor route (cell centers) from the entry to `cell`, following BFS parents. */
export function routeTo(m: Maze, cell: number): Array<[number, number]> {
  const cells: number[] = []
  let cur = cell
  while (cur !== -1 && cells.length < m.cols * m.rows) {
    cells.push(cur)
    cur = m.parent[cur]
  }
  cells.reverse()
  return cells.map((c) => [(c % m.cols) + 0.5, Math.floor(c / m.cols) + 0.5])
}

/**
 * Map a sampled execution (normalized polyline) onto the maze: the shot is
 * drawn as the corridor route from the entry to the cell under its last point,
 * so every lit path reads as one walk through the same picture.
 */
export function snapPath(m: Maze, points: Array<[number, number]>): Array<[number, number]> {
  if (!points.length) return []
  return routeTo(m, cellAt(m, points[points.length - 1]))
}

/** Cells covered when `fraction` of the proof has been replayed. */
export function coveredCells(m: Maze, fraction: number): number[] {
  const count = Math.max(0, Math.min(m.order.length, Math.round(fraction * m.order.length)))
  return m.order.slice(0, count)
}
