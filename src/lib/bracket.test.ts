import { describe, expect, it } from 'vitest'
import {
  BYE,
  GF1,
  GF2,
  type Bracket,
  type Options,
  type Results,
  clearResult,
  computeState,
  computeStats,
  generateBracket,
  readyMatches,
  seedPositions,
  setResult,
} from './bracket'

const SIZES = [2, 3, 4, 5, 6, 8, 12, 16]

/** Deterministischer Zufallsgenerator (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const teams = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`)

interface SimOptions extends Options {
  seed: number
  /** Entscheidet den Sieger; Standard: Zufall */
  pick?: (a: string, b: string, matchId: string, r: () => number) => string
}

/** Spielt ein komplettes Turnier durch und prüft unterwegs Invarianten. */
function simulate(bracket: Bracket, o: SimOptions) {
  const r = rng(o.seed)
  const opts: Options = { grandFinalReset: o.grandFinalReset }
  const losses = new Map<string, number>(bracket.seeds.map((s) => [s, 0]))
  const meetings: [string, string, string][] = []
  let results: Results = {}

  for (let guard = 0; guard < 1000; guard++) {
    const state = computeState(bracket, results, opts)
    const ready = readyMatches(state)
    if (ready.length === 0) break
    const m = ready[0]
    const a = m.a as string
    const b = m.b as string
    // Niemand mit zwei Niederlagen darf noch spielen
    expect(losses.get(a)).toBeLessThan(2)
    expect(losses.get(b)).toBeLessThan(2)
    expect(a).not.toBe(b)
    const winner = o.pick ? o.pick(a, b, m.match.id, r) : r() < 0.5 ? a : b
    const loser = winner === a ? b : a
    const change = setResult(bracket, results, m.match.id, winner, Math.floor(r() * 6) + 1, opts)
    expect(change.invalidated).toEqual([])
    results = change.results
    losses.set(loser, losses.get(loser)! + 1)
    meetings.push([m.match.id, a, b])
  }

  return { state: computeState(bracket, results, opts), losses, results, meetings }
}

describe('seedPositions', () => {
  it('erzeugt die klassische Setzliste', () => {
    expect(seedPositions(2)).toEqual([1, 2])
    expect(seedPositions(4)).toEqual([1, 4, 2, 3])
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })
})

describe.each(SIZES)('Double Elimination mit %i Teams', (n) => {
  const bracket = generateBracket(teams(n), { seeding: 'order' })

  it('hat die erwartete Struktur', () => {
    const wb = bracket.matches.filter((m) => m.side === 'W')
    const lb = bracket.matches.filter((m) => m.side === 'L')
    expect(wb).toHaveLength(bracket.size - 1)
    expect(lb).toHaveLength(Math.max(0, bracket.size - 2))
    expect(bracket.matches.filter((m) => m.side === 'GF')).toHaveLength(2)
    expect(new Set(bracket.matches.map((m) => m.id)).size).toBe(bracket.matches.length)
    expect([...bracket.seeds].sort()).toEqual(teams(n).sort())
  })

  it('verteilt Freilose korrekt (nie zwei Freilose in einem Match, an die besten Setzplätze)', () => {
    const byes = bracket.size - n
    const r1 = bracket.matches.filter((m) => m.side === 'W' && m.round === 1)
    const byeMatches = r1.filter((m) => m.sources.some((s) => s.type === 'seed' && s.entrant === null))
    expect(byeMatches).toHaveLength(byes)
    for (const m of r1) {
      expect(m.sources.every((s) => s.type === 'seed' && s.entrant === null)).toBe(false)
    }
    // Freilos-Empfänger sind die Setzplätze 1..byes
    const receivers = byeMatches
      .map((m) => m.sources.find((s) => s.type === 'seed' && s.entrant !== null))
      .map((s) => (s as { entrant: string }).entrant)
      .sort()
    expect(receivers).toEqual(teams(n).slice(0, byes).sort())
  })

  it('leitet Freilose automatisch weiter', () => {
    const state = computeState(bracket, {}, { grandFinalReset: true })
    for (const st of state.list) {
      if (st.status === 'bye') {
        expect(st.loser).toBe(BYE)
        expect(st.winner).not.toBeNull()
      }
    }
    // Zu Beginn müssen genau die echten Erstrundenpartien spielbereit sein
    const ready = readyMatches(state)
    expect(ready.length).toBeGreaterThan(0)
    for (const m of ready) {
      expect(m.a).not.toBe(BYE)
      expect(m.b).not.toBe(BYE)
    }
  })

  for (const reset of [true, false]) {
    it(`jedes Team scheidet genau nach zwei Niederlagen aus (Bracket Reset ${reset ? 'an' : 'aus'})`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const { state, losses } = simulate(bracket, { seed, grandFinalReset: reset })
        expect(state.finished).toBe(true)
        expect(state.champion).not.toBeNull()
        for (const st of state.list) expect(['done', 'bye', 'skipped']).toContain(st.status)

        const champion = state.champion!
        expect(losses.get(champion)).toBeLessThanOrEqual(1)
        for (const [team, l] of losses) {
          if (team === champion) continue
          if (!reset && team === state.runnerUp && l === 1) {
            // Ohne Reset kann der WB-Sieger mit nur einer Niederlage Zweiter werden
            expect(state.byId[GF1].winner).toBe(state.byId[GF1].b)
            continue
          }
          expect(l).toBe(2)
        }

        const stats = computeStats(bracket, state)
        expect(stats[champion].status).toBe('champion')
        expect(Object.values(stats).filter((s) => s.status === 'out')).toHaveLength(n - 2)
      }
    })
  }

  it('Bracket Reset: gewinnt der LB-Sieger das Finale, gibt es ein zweites Finale', () => {
    const wbChamp = (state: ReturnType<typeof computeState>) => state.byId[GF1].a
    const run = (reset: boolean) =>
      simulate(bracket, {
        seed: 7,
        grandFinalReset: reset,
        // Im GF1 gewinnt immer die Loser-Bracket-Seite (b), sonst Zufall
        pick: (a, b, id, r) => (id === GF1 ? b : r() < 0.5 ? a : b),
      })

    const withReset = run(true)
    expect(withReset.state.byId[GF2].status).toBe('done')
    expect(withReset.losses.get(withReset.state.champion!)).toBe(1)

    const noReset = run(false)
    expect(noReset.state.byId[GF2].status).toBe('skipped')
    expect(noReset.state.champion).toBe(noReset.state.byId[GF1].b)
    expect(noReset.state.runnerUp).toBe(wbChamp(noReset.state))
  })

  it('ohne Bracket Reset nötig, wenn der WB-Sieger das Finale gewinnt', () => {
    const { state } = simulate(bracket, {
      seed: 3,
      grandFinalReset: true,
      pick: (a, b, id, r) => (id === GF1 ? a : r() < 0.5 ? a : b),
    })
    expect(state.byId[GF2].status).toBe('skipped')
    expect(state.champion).toBe(state.byId[GF1].a)
  })

  it('Anzahl echter Matches ist 2n-2 bzw. 2n-1 mit Reset', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { state, meetings } = simulate(bracket, { seed, grandFinalReset: true })
      const expected = state.byId[GF2].status === 'done' ? 2 * n - 1 : 2 * n - 2
      expect(meetings).toHaveLength(expected)
    }
  })
})

describe('Ergebnisse korrigieren', () => {
  const opts = { grandFinalReset: true }
  const bracket = generateBracket(teams(8), { seeding: 'order' })

  it('setzt abhängige Folgematches zurück', () => {
    const { results } = simulate(bracket, { seed: 11, grandFinalReset: true })
    const state = computeState(bracket, results, opts)
    const first = state.byId['W1-0']
    const other = first.winner === first.a ? first.b! : first.a!

    const change = setResult(bracket, results, 'W1-0', other, 2, opts)
    // Mindestens: WB Runde 2 und LB Runde 1 hängen davon ab
    expect(change.invalidated).toEqual(expect.arrayContaining(['W2-0', 'L1-0']))
    const after = computeState(bracket, change.results, opts)
    expect(after.byId['W1-0'].winner).toBe(other)
    expect(after.byId['W2-0'].status).toBe('ready')
    expect(after.byId['L1-0'].status).toBe('ready')
    expect(after.finished).toBe(false)
    // Nicht betroffene Matches bleiben erhalten
    expect(after.byId['W1-3'].status).toBe('done')
  })

  it('nur Becher ändern lässt Folgematches unberührt', () => {
    const { results } = simulate(bracket, { seed: 12, grandFinalReset: true })
    const st = computeState(bracket, results, opts).byId['W1-1']
    const change = setResult(bracket, results, 'W1-1', st.winner!, 5, opts)
    expect(change.invalidated).toEqual([])
    expect(change.results['W1-1'].cups).toBe(5)
  })

  it('Ergebnis löschen setzt Folgematches zurück', () => {
    const { results } = simulate(bracket, { seed: 13, grandFinalReset: true })
    const change = clearResult(bracket, results, 'W1-2', opts)
    expect(change.invalidated.length).toBeGreaterThan(0)
    expect(computeState(bracket, change.results, opts).byId['W1-2'].status).toBe('ready')
  })

  it('Reset abschalten nach gespieltem zweiten Finale entfernt dieses', () => {
    const { results } = simulate(bracket, {
      seed: 5,
      grandFinalReset: true,
      pick: (a, b, id, r) => (id === GF1 ? b : r() < 0.5 ? a : b),
    })
    const off = computeState(bracket, results, { grandFinalReset: false })
    expect(off.byId[GF2].status).toBe('skipped')
    expect(off.champion).toBe(off.byId[GF1].winner)
  })

  it('verweigert Ergebnisse für nicht spielbereite Matches', () => {
    expect(() => setResult(bracket, {}, 'W2-0', 'T1', undefined, opts)).toThrow()
    expect(() => setResult(bracket, {}, 'W1-0', 'T5', undefined, opts)).toThrow()
  })
})

describe('Loser-Bracket-Zuordnung vermeidet frühe Rematches', () => {
  for (const n of [8, 16]) {
    it(`${n} Teams: WB-Runde-2-Verlierer treffen im LB nicht direkt auf alte Gegner`, () => {
      const bracket = generateBracket(teams(n), { seeding: 'order' })
      for (let seed = 1; seed <= 30; seed++) {
        const { meetings } = simulate(bracket, { seed, grandFinalReset: true })
        const played = new Set<string>()
        const key = (a: string, b: string) => [a, b].sort().join('|')
        for (const [id, a, b] of meetings) {
          if (id.startsWith('L2-')) expect(played.has(key(a, b))).toBe(false)
          played.add(key(a, b))
        }
      }
    })
  }

  it('16 Teams: WB-Runde-3-Verlierer treffen nicht auf ihren Gegner aus WB-Runde 2', () => {
    const bracket = generateBracket(teams(16), { seeding: 'order' })
    for (let seed = 1; seed <= 30; seed++) {
      const { meetings } = simulate(bracket, { seed, grandFinalReset: true })
      const r2 = new Set(meetings.filter(([id]) => id.startsWith('W2-')).map(([, a, b]) => [a, b].sort().join('|')))
      for (const [id, a, b] of meetings) {
        if (id.startsWith('L4-')) expect(r2.has([a, b].sort().join('|'))).toBe(false)
      }
    }
  })
})

describe('Zufallsauslosung', () => {
  it('mischt die Setzliste reproduzierbar mit eigenem Zufallsgenerator', () => {
    const a = generateBracket(teams(12), { seeding: 'random', rng: rng(1) })
    const b = generateBracket(teams(12), { seeding: 'random', rng: rng(1) })
    expect(a.seeds).toEqual(b.seeds)
    expect(a.seeds).not.toEqual(teams(12))
  })

  it('braucht mindestens zwei Teilnehmer', () => {
    expect(() => generateBracket(['T1'], { seeding: 'order' })).toThrow()
  })
})

describe('Freilos-Struktur', () => {
  it('erkennt Freilos-Matches unabhängig von Ergebnissen', async () => {
    const { structuralByes } = await import('./bracket')
    for (const n of SIZES) {
      const bracket = generateBracket(teams(n), { seeding: 'order' })
      const byes = structuralByes(bracket)
      // In jedem simulierten Turnier sind genau diese Matches automatisch entschieden
      const { state } = simulate(bracket, { seed: n, grandFinalReset: true })
      const auto = state.list.filter((s) => s.status === 'bye').map((s) => s.match.id)
      expect([...byes].sort()).toEqual(auto.sort())
      if (n === bracket.size) expect(byes.size).toBe(0)
    }
  })
})
