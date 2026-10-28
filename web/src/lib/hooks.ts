import { useEffect, useState } from 'react'

/** Hash router: '#/a' -> 'a'. */
export function useHashRoute(defaultRoute = 'home'): [string, (r: string) => void] {
  const read = () => (window.location.hash.replace(/^#\/?/, '') || defaultRoute).split('?')[0]
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onHash = () => setRoute(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return [route, (r: string) => { window.location.hash = `/${r}` }]
}

/** Reduced-motion preference, kept in sync with the media query. */
export function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** Seconds elapsed since `since` (ms timestamp) while `running`. */
export function useElapsed(running: boolean, since: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [running])
  if (!running || since == null) return 0
  return (now - since) / 1000
}
