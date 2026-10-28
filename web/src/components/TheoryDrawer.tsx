import { useState } from 'react'

export interface TheoryDrawerProps {
  theory: string
  label: string
  heuristics: string[]
  heuristic: string
  onHeuristic: (h: string) => void
  onLoad: () => Promise<void> | void
  onVerifyText: (text: string) => void
  busy: boolean
  live: boolean
}

/** Collapsible theory editor kept from the old page. */
export function TheoryDrawer({ theory, label, heuristics, heuristic, onHeuristic, onLoad, onVerifyText, busy, live }: TheoryDrawerProps) {
  const [text, setText] = useState<string | null>(null)
  const value = text ?? theory
  return (
    <details className="drawer">
      <summary><span>Theory editor {label ? <span className="muted">· {label}</span> : null}</span><span className="muted">{value ? `${value.split('\n').length} lines` : 'not loaded'}</span></summary>
      <div className="body stack">
        <div className="row">
          <button type="button" className="secondary" onClick={() => { setText(null); void onLoad() }} disabled={busy || !live}>Load assembled theory</button>
          <label className="small" htmlFor="heuristic">Heuristic</label>
          <select id="heuristic" style={{ width: 90 }} value={heuristic} onChange={(e) => onHeuristic(e.target.value)}>
            {heuristics.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <button type="button" onClick={() => onVerifyText(value)} disabled={busy || !live || !value.trim()}>Verify this text</button>
          {!live ? <span className="status-line">Live verification is disabled in archive mode.</span> : null}
        </div>
        <textarea className="theory" spellCheck={false} value={value} onChange={(e) => setText(e.target.value)} aria-label="Theory text" placeholder="Load the assembled theory to edit it. include( is refused by the server." />
      </div>
    </details>
  )
}
