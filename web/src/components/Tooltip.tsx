import { useCallback, useState, type ReactNode } from 'react'

interface TipState { x: number; y: number; content: ReactNode }

/** Pointer-following tooltip; the same content is shown on keyboard focus. */
export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null)
  const show = useCallback((e: { clientX?: number; clientY?: number; currentTarget?: Element | EventTarget | null }, content: ReactNode) => {
    let x = e.clientX ?? 0
    let y = e.clientY ?? 0
    if ((x === 0 && y === 0) && e.currentTarget instanceof Element) {
      const r = e.currentTarget.getBoundingClientRect()
      x = r.left + r.width / 2
      y = r.top
    }
    setTip({ x, y, content })
  }, [])
  const hide = useCallback(() => setTip(null), [])
  const node = tip ? <Tooltip x={tip.x} y={tip.y}>{tip.content}</Tooltip> : null
  return { show, hide, node }
}

export function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const left = Math.min(x + 12, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 440)
  const top = y + 14
  return (
    <div className="tooltip" role="tooltip" style={{ left, top }}>
      {children}
    </div>
  )
}
