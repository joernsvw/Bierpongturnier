import { useCallback, useRef, useState } from 'react'
import { shuffle } from './bracket'
import * as S from './state'
import type { Store } from './useStore'

export interface Spin {
  key: number
  /** Lostopf zum Zeitpunkt des Drehens (bleibt während der Animation stabil) */
  pool: S.Player[]
  targets: [string, string]
}

/** Steuert die Team-Auslosung mit zwei Glücksrädern. */
export function useDraw(store: Store) {
  const [spin, setSpin] = useState<Spin | null>(null)
  const [lastTeam, setLastTeam] = useState<string[] | null>(null)
  // Lostopf der letzten Drehung – die Räder zeigen ihn weiter, damit man sieht, wo sie gelandet sind
  const [lastSpin, setLastSpin] = useState<Spin | null>(null)
  const finished = useRef(0)

  const next = useCallback(() => {
    if (spin) return
    const pool = S.drawPool(store.state)
    if (pool.length < 2) return
    const [p1, p2] = shuffle(pool).map((p) => p.id)
    finished.current = 0
    setLastTeam(null)
    const s = { key: Date.now(), pool, targets: [p1, p2] as [string, string] }
    setSpin(s)
    setLastSpin(s)
  }, [spin, store.state])

  /** Wird von jedem Rad aufgerufen, wenn es steht. */
  const wheelDone = useCallback(() => {
    finished.current++
    if (finished.current < 2 || !spin) return
    const ids = [...spin.targets]
    store.commit((s) => S.createTeam(s, ids), 'Team ausgelost')
    setLastTeam(ids)
    setSpin(null)
  }, [spin, store])

  const all = useCallback(() => {
    if (spin) return
    const pool = shuffle(S.drawPool(store.state))
    if (pool.length < 2) return
    store.commit((s) => {
      let next = s
      for (let i = 0; i + 1 < pool.length; i += 2) next = S.createTeam(next, [pool[i].id, pool[i + 1].id])
      return next
    }, 'Alle Teams ausgelost')
    setLastTeam(null)
    setLastSpin(null)
  }, [spin, store])

  const reset = useCallback(() => {
    setSpin(null)
    setLastTeam(null)
    setLastSpin(null)
    store.commit((s) => ({ ...s, teams: [] }), 'Auslosung zurückgesetzt')
  }, [store])

  return { spin, lastSpin: lastTeam ? lastSpin : null, lastTeam, next, all, reset, wheelDone, spinning: spin !== null }
}

export type Draw = ReturnType<typeof useDraw>
