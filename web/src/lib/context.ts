import { createContext, useContext } from 'react'
import type { Boot } from './api'

export interface AppState extends Boot {
  reload: () => void
}

export const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('AppContext missing')
  return ctx
}
