/** The one-line takeaway under Station A, computed from the state. Pure. */
import type { LemmaResult, VerifyResult } from './api'

export interface SimSummary {
  shots: number
  detected: boolean
  attacksPresent: boolean
  qber: number
  eveKnows: number
  strategyLabel?: string
}

export function fmtInt(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n))
}

export function fmtPct(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '–'
  return `${(x * 100).toFixed(digits)} %`
}

export function fmtSeconds(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return '–'
  if (s < 10) return `${s.toFixed(1)} s`
  return `${Math.round(s)} s`
}

export function simulationSentence(s: SimSummary | null): string {
  if (!s || s.shots === 0) return 'Simulation: not started.'
  const base = `Simulation: ${fmtInt(s.shots)} shots`
  if (!s.attacksPresent) return `${base}, honest run, error rate ${fmtPct(s.qber)}.`
  if (s.detected) return `${base}, attack detected (error rate ${fmtPct(s.qber)}).`
  const knows = s.eveKnows > 0.5 ? `, attacker knows ${fmtPct(s.eveKnows, 0)} of the key` : ''
  return `${base}, 0 detections${knows}.`
}

export type Verdict = 'verified' | 'falsified' | 'timeout' | 'inconclusive' | 'pending'

export function lemmaVerdict(l: LemmaResult | null | undefined, timedOut = false): Verdict {
  if (timedOut) return 'timeout'
  if (!l) return 'pending'
  if (l.verified) return 'verified'
  if (/falsified/i.test(l.status)) return 'falsified'
  return 'inconclusive'
}

export function pickLemma(result: VerifyResult | null, name: string | null | undefined): LemmaResult | null {
  if (!result) return null
  if (name) return result.lemmas.find((l) => l.name === name) ?? result.lemmas[0] ?? null
  return result.lemmas[0] ?? null
}

export function proofSentence(result: VerifyResult | null, lemma: LemmaResult | null, running = false, elapsed = 0): string {
  if (running) return `Proof: Tamarin running, ${Math.round(elapsed)} s elapsed.`
  if (!result) return 'Proof: not run.'
  if (result.timed_out) return `Proof: inconclusive, Tamarin hit the ${fmtSeconds(result.seconds)} limit.`
  if (!lemma) return 'Proof: no lemma in the result.'
  const steps = lemma.steps != null ? `${lemma.steps} steps` : 'steps unknown'
  const v = lemmaVerdict(lemma)
  if (v === 'falsified') {
    const kind = lemma.quantifier === 'exists-trace' ? 'no execution found' : `counterexample in ${steps}`
    return `Proof: ${kind}, ${fmtSeconds(result.seconds)}.`
  }
  if (v === 'verified') {
    const kind = lemma.quantifier === 'exists-trace' ? `execution exists, ${steps}` : `holds for every trace the attacker model permits, ${steps}`
    return `Proof: ${kind}, ${fmtSeconds(result.seconds)}.`
  }
  return `Proof: ${lemma.status}.`
}

export function takeaway(sim: SimSummary | null, result: VerifyResult | null, lemma: LemmaResult | null, running = false, elapsed = 0): string {
  return `${simulationSentence(sim)} ${proofSentence(result, lemma, running, elapsed)}`
}
