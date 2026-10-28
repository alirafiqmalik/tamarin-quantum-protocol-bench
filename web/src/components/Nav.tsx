import { useApp } from '../lib/context'

export const ROUTES: Array<{ id: string; label: string; title: string }> = [
  { id: 'home', label: 'Home', title: 'Introduction' },
  { id: 'a', label: 'A · Simulate or prove', title: 'Station A' },
  { id: 'b', label: 'B · Attack witness', title: 'Station B' },
  { id: 'c', label: 'C · Evidence matrix', title: 'Station C' },
]

export function Nav({ route }: { route: string }) {
  const app = useApp()
  return (
    <header className="topbar">
      <a className="brand" href="#/home">PQQS demo · symbolic verification of quantum protocols</a>
      <nav className="tabs" aria-label="Stations">
        {ROUTES.map((r) => (
          <a key={r.id} className="tab" href={`#/${r.id}`} aria-current={route === r.id ? 'page' : undefined}>
            {r.label}
          </a>
        ))}
      </nav>
      <span className={`mode-badge ${app.mode}`} title={app.mode === 'archive' ? `Live server unavailable: ${app.reason ?? ''}` : 'Live Tamarin server'}>
        {app.mode === 'live' ? `live · Tamarin ${app.environment.tamarin ?? '?'}` : 'archive mode: recorded runs'}
      </span>
    </header>
  )
}
