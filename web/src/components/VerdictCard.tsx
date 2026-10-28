import type { LemmaMeta, LemmaResult } from '../lib/api'
import { fmtSeconds, shortHash } from '../lib/format'
import { lemmaVerdict, type Verdict } from '../lib/takeaway'

export interface VerdictCardProps {
  lemma: LemmaResult | null
  meta?: LemmaMeta
  seconds?: number | null
  version?: string
  hash?: string
  timedOut?: boolean
  source: 'live' | 'cached' | 'pending'
  recorded?: string
  label?: string
  attribution?: string | null
}

const HEAD: Record<Verdict, string> = {
  verified: 'Verified for all traces',
  falsified: 'Counterexample found',
  timeout: 'Inconclusive (timeout)',
  inconclusive: 'Inconclusive',
  pending: 'No result yet',
}
const ICON: Record<Verdict, string> = { verified: '✓', falsified: '✕', timeout: '?', inconclusive: '?', pending: '·' }

export function VerdictCard({ lemma, meta, seconds, version, hash, timedOut = false, source, recorded, label, attribution }: VerdictCardProps) {
  const v = lemmaVerdict(lemma, timedOut)
  let headline = HEAD[v]
  if (lemma?.quantifier === 'exists-trace') {
    if (v === 'verified') headline = 'Execution exists'
    if (v === 'falsified') headline = 'No execution found'
  }
  return (
    <div className={`verdict ${v}`} aria-live="polite">
      <div className="spread">
        <div className="headline"><span aria-hidden="true">{ICON[v]}</span> {headline}</div>
        <span>
          {attribution ? <span className={`pill ${attribution.toLowerCase()}`} title="Attribution to the published vulnerability">{attribution}</span> : null}{' '}
          <span className={`pill ${source === 'pending' ? '' : source}`}>{source === 'live' ? 'live run' : source === 'cached' ? 'cached' : 'pending'}</span>
        </span>
      </div>
      <dl>
        <dt>Lemma</dt><dd>{meta?.title ? `${meta.title} ` : ''}<code>{lemma?.name ?? '–'}</code>{lemma?.quantifier ? ` (${lemma.quantifier})` : ''}</dd>
        {meta?.desc ? <><dt>Claim</dt><dd>{meta.desc}</dd></> : null}
        {label ? <><dt>Model</dt><dd>{label}</dd></> : null}
        <dt>Status</dt><dd>{timedOut ? 'timed out, treat as inconclusive' : lemma?.status ?? '–'}</dd>
        <dt>Steps</dt><dd>{lemma?.steps ?? '–'}{lemma?.proof ? ` (tree depth ${lemma.proof.depth})` : ''}</dd>
        <dt>Time</dt><dd>{fmtSeconds(seconds)}</dd>
        <dt>Tamarin</dt><dd>{version ?? '–'}</dd>
        <dt>Model hash</dt><dd><code title={hash}>{shortHash(hash)}</code></dd>
        {recorded ? <><dt>Recorded</dt><dd>{recorded}</dd></> : null}
      </dl>
    </div>
  )
}
