import { useEffect, useState } from 'react'
import type { LemmaResult } from '../lib/api'
import { lemmaVerdict } from '../lib/takeaway'
import { ExecutionSpace } from './ExecutionSpace'
import { ProofTree } from './ProofTree'

export interface ProofReplayProps {
  lemma: LemmaResult | null
  timedOut?: boolean
  reduced: boolean
  /** Replay key: changing it restarts the animation. */
  replayKey: string
  running?: boolean
  elapsed?: number
  showMaze?: boolean
}

/**
 * Replays proof.order as a growing tree while the coverage spreads over the
 * execution space. Reduced motion jumps to the final state.
 */
export function ProofReplay({ lemma, timedOut = false, reduced, replayKey, running = false, elapsed = 0, showMaze = true }: ProofReplayProps) {
  const order = lemma?.proof?.order ?? []
  const total = order.length
  const [shown, setShown] = useState(0)
  const verdict = lemmaVerdict(lemma, timedOut)
  const outcome: 'verified' | 'falsified' | 'other' = verdict === 'verified' ? 'verified' : verdict === 'falsified' ? 'falsified' : 'other'

  useEffect(() => {
    if (!total) {
      setShown(0)
      return
    }
    if (reduced) {
      setShown(total)
      return
    }
    setShown(0)
    const duration = Math.min(6000, Math.max(1500, total * 45))
    const start = performance.now()
    let id = 0
    const tick = (now: number) => {
      const f = Math.min(1, (now - start) / duration)
      setShown(Math.max(1, Math.round(f * total)))
      if (f < 1) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [replayKey, total, reduced])

  const coverage = total ? shown / total : running ? Math.min(0.25, elapsed / 60) : 0
  const spaceOutcome = running ? 'pending' : verdict
  const counter = running ? `${Math.round(elapsed)} s · exploring` : total ? `${Math.min(shown, total)} / ${total} proof steps` : undefined

  return (
    <div className="stack">
      {showMaze ? (
        <ExecutionSpace coverage={running ? coverage : total ? coverage : 0} outcome={spaceOutcome} reduced={reduced} caption="Every path the attacker model permits, covered by the proof" counter={counter} />
      ) : null}
      {lemma?.proof && total ? <ProofTree proof={lemma.proof} shown={shown} outcome={outcome} reduced={reduced} /> : (
        <p className="help">{running ? 'Tamarin is exploring the case tree. The proof is replayed when it arrives.' : timedOut ? 'No proof tree: the run hit its time limit (inconclusive).' : 'No proof yet.'}</p>
      )}
    </div>
  )
}
