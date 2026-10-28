import { useCallback, useEffect, useState } from 'react'
import { boot, type Boot } from './lib/api'
import { AppContext } from './lib/context'
import { useHashRoute } from './lib/hooks'
import { Footer } from './components/Footer'
import { Nav } from './components/Nav'
import { Home } from './views/Home'
import { StationA } from './views/StationA'
import { StationB } from './views/StationB'
import { StationC } from './views/StationC'

export default function App() {
  const [state, setState] = useState<Boot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [route] = useHashRoute('home')

  const reload = useCallback(() => {
    setError(null)
    boot().then(setState).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    const titles: Record<string, string> = { home: 'Home', a: 'Station A', b: 'Station B', c: 'Station C' }
    document.title = `${titles[route] ?? 'PQQS'} · Simulate it, or prove it?`
    window.scrollTo({ top: 0 })
  }, [route])

  if (error) {
    return (
      <div className="shell">
        <h1>Cannot start</h1>
        <p className="status-line error">{error}</p>
        <p className="help">Neither the live server (<code>python3 app.py</code>, port 8765) nor the static archive (<code>/catalog.json</code> and <code>/evidence/index.json</code>) could be loaded.</p>
        <button type="button" onClick={reload}>Retry</button>
      </div>
    )
  }
  if (!state) return <div className="shell"><p className="help">Loading the catalog.</p></div>

  return (
    <AppContext.Provider value={{ ...state, reload }}>
      <div className="shell">
        <Nav route={route} />
        <main>
          {route === 'a' ? <StationA /> : route === 'b' ? <StationB /> : route === 'c' ? <StationC /> : <Home />}
        </main>
        <Footer />
      </div>
    </AppContext.Provider>
  )
}
