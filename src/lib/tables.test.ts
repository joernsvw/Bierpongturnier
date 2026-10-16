import { describe, expect, it } from 'vitest'
import type { AppState } from './state'
import { computeState, generateBracket, readyMatches, setResult } from './bracket'
import { queuedMatches, reconcileTables } from './tables'

describe('Tisch-Zuordnung', () => {
  it('verteilt die ersten Matches auf freie Tische', () => {
    expect(reconcileTables(undefined, ['a', 'b', 'c'], 2)).toEqual(['a', 'b'])
    expect(reconcileTables(undefined, ['a'], 2)).toEqual(['a', null])
  })

  it('laufende Matches behalten ihren Tisch', () => {
    // Match an Tisch 1 ist fertig, Tisch 2 läuft weiter
    expect(reconcileTables(['a', 'b'], ['b', 'c', 'd'], 2)).toEqual(['c', 'b'])
  })

  it('entfernt ungültig gewordene Matches und rückt nach', () => {
    expect(reconcileTables(['a', 'x'], ['a', 'c'], 2)).toEqual(['a', 'c'])
  })

  it('passt sich an eine geänderte Tischanzahl an', () => {
    expect(reconcileTables(['a', 'b'], ['a', 'b', 'c'], 3)).toEqual(['a', 'b', 'c'])
    expect(reconcileTables(['a', 'b', 'c'], ['a', 'b', 'c'], 1)).toEqual(['a'])
  })

  it('Warteschlange enthält nur Matches ohne Tisch', () => {
    expect(queuedMatches(['a', null], ['a', 'b', 'c'])).toEqual(['b', 'c'])
  })

  it('kein Team steht gleichzeitig an zwei Tischen (komplettes Turnier, 2 Tische)', () => {
    for (const n of [4, 5, 6, 8, 12, 16]) {
      const ids = Array.from({ length: n }, (_, i) => `T${i + 1}`)
      const bracket = generateBracket(ids, { seeding: 'order' })
      const opts = { grandFinalReset: true }
      let results = {}
      let tables = reconcileTables(undefined, [], 2)
      for (let guard = 0; guard < 200; guard++) {
        const state = computeState(bracket, results, opts)
        const ready = readyMatches(state).map((s) => s.match.id)
        tables = reconcileTables(tables, ready, 2)
        const playing = tables.filter((id): id is string => id !== null)
        if (playing.length === 0) break
        const teams = playing.flatMap((id) => [state.byId[id].a, state.byId[id].b])
        expect(new Set(teams).size).toBe(teams.length)
        // abwechselnd Tisch 2 und Tisch 1 zuerst fertig werden lassen
        const id = playing[guard % playing.length]
        results = setResult(bracket, results, id, state.byId[id].a!, undefined, opts).results
      }
      expect(computeState(bracket, results, opts).finished).toBe(true)
    }
  })
})

describe('Zwei Turniere gleichzeitig', () => {
  it('setzt keinen Spieler gleichzeitig an zwei Tische', () => {
    const players: Record<string, string[]> = {
      'single:a': ['anna', 'ben'],
      'double:x': ['anna', 'clara', 'david', 'emma'],
      'double:y': ['felix', 'greta', 'hannes', 'ida'],
    }
    const tables = reconcileTables(undefined, ['single:a', 'double:x', 'double:y'], 2, (k) => players[k])
    expect(tables).toEqual(['single:a', 'double:y'])
  })

  it('lässt einen Tisch frei, wenn nur Konflikt-Matches warten', () => {
    const players: Record<string, string[]> = { a: ['p1', 'p2'], b: ['p1', 'p3'] }
    expect(reconcileTables(undefined, ['a', 'b'], 2, (k) => players[k])).toEqual(['a', null])
  })

  it('verzahnt beide Turniere abwechselnd', async () => {
    const { interleave } = await import('./tables')
    expect(interleave(['d1', 'd2', 'd3'], ['s1'])).toEqual(['d1', 's1', 'd2', 'd3'])
  })
})

describe('Fairness zwischen Einzel und Doppel', () => {
  it('ein frei gewordener Tisch geht an das Turnier mit weniger belegten Tischen', async () => {
    const { initialState, startTournament, withResults, tournamentState, parseTableKey } = await import('./state')
    const { setResult } = await import('./bracket')
    const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    const teams = [0, 2, 4, 6].map((i, k) => ({ id: `t${k}`, name: `T${k}`, customName: true, playerIds: [`p${i}`, `p${i + 1}`] }))
    let s: AppState = { ...initialState, players, teams, settings: { ...initialState.settings, seeding: 'order', tables: 2 } }
    s = startTournament(s, 'double')
    s = startTournament(s, 'single')
    // Zu Beginn: beide Doppel-Erstrundenspiele belegen die Tische (alle Spieler beschäftigt)
    expect(s.tables.every((k) => k?.startsWith('double:'))).toBe(true)

    // Tisch 1 wird frei → jetzt darf ein Einzel ran, wenn dessen Spieler frei sind
    const key = s.tables[0]!
    const { matchId } = parseTableKey(key)
    const ts = tournamentState(s, 'double')!
    const st = ts.byId[matchId]
    const results = setResult(s.tournaments.double!.bracket, s.tournaments.double!.results, matchId, st.a!, undefined, { grandFinalReset: true }).results
    s = withResults(s, results, 'double')
    const { matchPlayers } = await import('./state')
    const playersAt = (k: string) => {
      const { mode, matchId: id } = parseTableKey(k)
      const m = tournamentState(s, mode)!.byId[id]
      return matchPlayers(s, mode, m.a, m.b)
    }
    // Einzel hatte keinen Tisch → bekommt den frei gewordenen
    expect(s.tables[0]!.startsWith('single:')).toBe(true)
    const overlap = playersAt(s.tables[0]!).filter((p) => playersAt(s.tables[1]!).includes(p))
    expect(overlap).toEqual([])
  })
})
