/**
 * Verteilung spielbereiter Matches auf mehrere Tische.
 *
 * Ein Match bleibt an seinem Tisch, bis es entschieden (oder durch eine
 * Korrektur ungültig) ist. Freie Tische bekommen das nächste passende Match
 * aus der Warteschlange. So springt ein laufendes Spiel nie von Tisch 2 auf
 * Tisch 1. Läuft parallel ein zweites Turnier, wird kein Match an einen Tisch
 * gesetzt, solange einer seiner Spieler schon an einem anderen Tisch steht.
 */
export type TableAssignment = (string | null)[]

export function reconcileTables(
  prev: TableAssignment | undefined,
  /** spielbereite Matches in gewünschter Reihenfolge */
  ready: string[],
  count: number,
  /** Spieler eines Matches (für Konflikte zwischen zwei Turnieren) */
  playersOf: (key: string) => string[] = () => [],
): TableAssignment {
  const readySet = new Set(ready)
  const next: TableAssignment = Array.from({ length: count }, (_, i) => {
    const id = prev?.[i] ?? null
    return id && readySet.has(id) ? id : null
  })
  const busy = new Set(next.flatMap((id) => (id ? playersOf(id) : [])))
  const assigned = new Set(next.filter(Boolean))
  const queue = ready.filter((id) => !assigned.has(id))
  for (let i = 0; i < count; i++) {
    if (next[i] !== null) continue
    const pick = queue.findIndex((id) => playersOf(id).every((p) => !busy.has(p)))
    if (pick < 0) break
    const [id] = queue.splice(pick, 1)
    next[i] = id
    playersOf(id).forEach((p) => busy.add(p))
  }
  return next
}

/** Matches in der Warteschlange (spielbereit, aber noch ohne Tisch) */
export function queuedMatches(assignment: TableAssignment, ready: string[]): string[] {
  const assigned = new Set(assignment.filter(Boolean))
  return ready.filter((id) => !assigned.has(id))
}

/** Reißverschluss: abwechselnd aus mehreren Listen */
export function interleave<T>(...lists: T[][]): T[] {
  const out: T[] = []
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) {
    for (const l of lists) if (i < l.length) out.push(l[i])
  }
  return out
}
