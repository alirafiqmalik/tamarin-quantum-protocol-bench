import { useMemo } from 'react'
import { motion } from 'motion/react'
import { coveredCells, makeMaze, snapPath, wallPath, type Maze } from '../lib/maze'
import type { Path } from '../sim/types'

export interface LitPath extends Path {
  key: string
}

export interface ExecutionSpaceProps {
  maze?: Maze
  /** Recently sampled paths (simulation side). */
  paths?: LitPath[]
  /** 0..1 coverage of the proof replay (verification side). */
  coverage?: number
  /** Final outcome drawn when coverage reaches 1. */
  outcome?: 'verified' | 'falsified' | 'timeout' | 'pending' | 'inconclusive'
  reduced: boolean
  caption?: string
  counter?: string
  /** Lit path lifetime in ms (simulation side). */
  fadeMs?: number
}

export const SHARED_MAZE = makeMaze(30, 16, 11)

const PATH_COLOR: Record<Path['outcome'], string> = { ok: '#8a8378', error: '#9a3412', eve: '#6b1f08' }

/**
 * The "space of executions": a faint maze. Simulation lights single corridors
 * for a moment; the proof spreads green coverage from the entry over every
 * reachable corridor, ending in a red dot when a counterexample is found.
 */
export function ExecutionSpace({ maze = SHARED_MAZE, paths = [], coverage = 0, outcome = 'pending', reduced, caption, counter, fadeMs = 1400 }: ExecutionSpaceProps) {
  const walls = useMemo(() => wallPath(maze), [maze])
  const cell = 20
  const w = maze.cols * cell
  const h = maze.rows * cell
  const falsified = outcome === 'falsified'
  // A counterexample is found before the whole space is covered.
  const target = falsified ? 0.68 : outcome === 'timeout' || outcome === 'inconclusive' ? 0.45 : 1
  const covered = useMemo(() => coveredCells(maze, Math.min(1, coverage) * target), [maze, coverage, target])
  const frontier = covered.length ? covered[covered.length - 1] : null
  const done = coverage >= 1
  const coverColor = outcome === 'timeout' || outcome === 'inconclusive' ? '#8a5a12' : '#0f6e56'

  return (
    <div className="space">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={caption ?? 'Space of executions'}>
        <g transform={`scale(${cell})`}>
          {covered.map((c, k) => {
            const x = c % maze.cols
            const y = Math.floor(c / maze.cols)
            const isFrontier = k === covered.length - 1 && !done
            return reduced ? (
              <rect key={c} x={x} y={y} width={1} height={1} fill={coverColor} opacity={isFrontier ? 0.75 : 0.32} />
            ) : (
              <motion.rect key={c} x={x} y={y} width={1} height={1} fill={coverColor} initial={{ opacity: 0.85 }} animate={{ opacity: isFrontier ? 0.75 : 0.32 }} transition={{ duration: 0.6 }} />
            )
          })}
          <path d={walls} fill="none" stroke="#d9d1c3" strokeWidth={0.08} strokeLinecap="square" />
          {/* entry marker */}
          <circle cx={0.5} cy={0.5} r={0.22} fill="#1c1915" />
          {paths.map((p) => {
            const pts = snapPath(maze, p.points).map(([x, y]) => `${x},${y}`).join(' ')
            const stroke = PATH_COLOR[p.outcome]
            const width = p.outcome === 'ok' ? 0.14 : 0.2
            if (reduced) return <polyline key={p.key} points={pts} fill="none" stroke={stroke} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
            return (
              <motion.polyline key={p.key} points={pts} fill="none" stroke={stroke} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: fadeMs / 1000, ease: 'easeOut' }} />
            )
          })}
          {done && falsified && frontier != null ? (
            <g>
              {reduced ? null : <motion.circle cx={(frontier % maze.cols) + 0.5} cy={Math.floor(frontier / maze.cols) + 0.5} r={0.4} fill="none" stroke="#9a3412" strokeWidth={0.08} initial={{ scale: 0.4, opacity: 1 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 1.4, repeat: Infinity }} style={{ transformOrigin: `${(frontier % maze.cols) + 0.5}px ${Math.floor(frontier / maze.cols) + 0.5}px` }} />}
              <circle cx={(frontier % maze.cols) + 0.5} cy={Math.floor(frontier / maze.cols) + 0.5} r={0.34} fill="#9a3412" stroke="#fffdf8" strokeWidth={0.08} />
            </g>
          ) : null}
        </g>
      </svg>
      {caption ? <div className="caption">{caption}</div> : null}
      {counter ? <div className="counter" aria-live="off">{counter}</div> : null}
    </div>
  )
}
