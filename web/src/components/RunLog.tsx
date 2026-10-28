import { useEffect, useRef } from 'react'

/** Prover log. Streams while a run is active; folds into a disclosure once it is done. */
export function RunLog({ lines, status, error, collapsed = false }: { lines: string[]; status?: string; error?: string | null; collapsed?: boolean }) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines.length])
  const log = lines.length ? <pre className="log" ref={ref}>{lines.slice(-80).join('\n')}</pre> : null
  return (
    <div>
      {status ? <div className="status-line">{status}</div> : null}
      {error ? <div className="status-line error" role="alert">{error}</div> : null}
      {log && collapsed ? (
        <details className="log-details">
          <summary>Prover log ({lines.length} lines)</summary>
          {log}
        </details>
      ) : log}
    </div>
  )
}
