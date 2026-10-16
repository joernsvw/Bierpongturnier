import { useCallback, useEffect, useRef, useState } from 'react'
import { type AppState, loadState, saveState } from './state'

interface HistoryEntry {
  state: AppState
  label: string
}

const MAX_HISTORY = 50

/**
 * Zentraler App-Zustand mit localStorage-Persistenz und Undo.
 * `commit(next, label)` übernimmt einen neuen Zustand und merkt sich den alten.
 */
export function useStore() {
  const [state, setState] = useState<AppState>(loadState)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => saveState(state), [state])

  const commit = useCallback((next: AppState | ((s: AppState) => AppState), label: string) => {
    const prev = stateRef.current
    const value = typeof next === 'function' ? next(prev) : next
    if (value === prev) return
    stateRef.current = value
    setState(value)
    setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), { state: prev, label }])
  }, [])

  /** Änderung ohne Undo-Eintrag (z. B. Ansicht wechseln) */
  const update = useCallback((fn: (s: AppState) => AppState) => {
    const value = fn(stateRef.current)
    stateRef.current = value
    setState(value)
  }, [])

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h
      const last = h[h.length - 1]
      stateRef.current = last.state
      setState(last.state)
      return h.slice(0, -1)
    })
  }, [])

  return {
    state,
    commit,
    update,
    undo,
    canUndo: history.length > 0,
    undoLabel: history[history.length - 1]?.label,
  }
}

export type Store = ReturnType<typeof useStore>
