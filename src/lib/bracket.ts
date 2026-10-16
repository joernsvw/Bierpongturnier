/**
 * Double-Elimination-Bracket – UI-unabhängige Logik.
 *
 * Grundidee: Die Struktur (welche Matches gibt es, woher kommen ihre Teilnehmer)
 * wird einmal erzeugt und bleibt fix. Der Turnierstand wird nur durch die
 * eingetragenen Ergebnisse bestimmt und jederzeit daraus neu berechnet.
 * Dadurch sind Freilose, Weiterleitung und Korrekturen trivial konsistent.
 */

export type Side = 'W' | 'L' | 'GF'

export type Source =
  | { type: 'seed'; entrant: string | null } // null = Freilos
  | { type: 'winner'; match: string }
  | { type: 'loser'; match: string }

export interface Match {
  id: string
  side: Side
  /** 1-basiert innerhalb der Seite (WB, LB, GF) */
  round: number
  /** 0-basiert innerhalb der Runde */
  index: number
  /** Kurzbezeichnung für die Anzeige, z. B. "W5", "L3", "GF" */
  label: string
  sources: [Source, Source]
  /** Länge des längsten Pfads vom Turnierstart – dient als Spielreihenfolge */
  depth: number
}

export interface Bracket {
  /** Größe des Winner Brackets (Zweierpotenz) */
  size: number
  /** Teilnehmer in Setz-Reihenfolge (Index 0 = Setzplatz 1) */
  seeds: string[]
  wbRounds: number
  lbRounds: number
  matches: Match[]
}

export interface MatchResult {
  a: string
  b: string
  winner: string
  /** verbleibende Becher des Siegers (optional) */
  cups?: number
}

export type Results = Record<string, MatchResult>

export interface Options {
  /** Bracket Reset: zweites Finale, wenn der Loser-Bracket-Sieger das erste gewinnt */
  grandFinalReset: boolean
}

export const BYE = '__BYE__'

/** Entrant-ID, BYE oder null (= steht noch nicht fest) */
export type Slot = string | null

export type MatchStatus =
  | 'waiting' // mindestens ein Teilnehmer steht noch nicht fest
  | 'ready' // beide Teilnehmer stehen fest, kein Ergebnis
  | 'done' // Ergebnis eingetragen
  | 'bye' // automatisch entschieden (Freilos)
  | 'skipped' // wird nicht gespielt (Bracket Reset unnötig/abgeschaltet)

export interface MatchState {
  match: Match
  a: Slot
  b: Slot
  winner: Slot
  loser: Slot
  status: MatchStatus
  result?: MatchResult
}

export interface TournamentState {
  byId: Record<string, MatchState>
  list: MatchState[]
  champion: string | null
  runnerUp: string | null
  finished: boolean
}

export const GF1 = 'GF1'
export const GF2 = 'GF2'

// ---------------------------------------------------------------------------
// Generierung
// ---------------------------------------------------------------------------

export function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

/** Klassische Setzpositionen, z. B. für 8: [1, 8, 4, 5, 2, 7, 3, 6] */
export function seedPositions(size: number): number[] {
  let seeds = [1]
  while (seeds.length < size) {
    const len = seeds.length * 2
    seeds = seeds.flatMap((s) => [s, len + 1 - s])
  }
  return seeds
}

export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface GenerateOptions {
  seeding: 'random' | 'order'
  rng?: () => number
}

export function generateBracket(entrants: readonly string[], opts: GenerateOptions): Bracket {
  if (entrants.length < 2) throw new Error('Mindestens zwei Teilnehmer nötig')
  if (new Set(entrants).size !== entrants.length) throw new Error('Teilnehmer-IDs müssen eindeutig sein')

  const seeds = opts.seeding === 'random' ? shuffle(entrants, opts.rng) : [...entrants]
  const n = seeds.length
  const size = nextPowerOfTwo(n)
  const wbRounds = Math.log2(size)
  const lbRounds = wbRounds >= 2 ? 2 * (wbRounds - 1) : 0

  const matches: Match[] = []
  const byId = new Map<string, Match>()
  const add = (m: Omit<Match, 'depth' | 'label'>) => {
    const depth =
      1 +
      Math.max(
        0,
        ...m.sources.map((s) => (s.type === 'seed' ? 0 : byId.get(s.match)!.depth)),
      )
    const full: Match = { ...m, depth, label: '' }
    matches.push(full)
    byId.set(full.id, full)
    return full
  }
  const wbId = (r: number, i: number) => `W${r}-${i}`
  const lbId = (r: number, i: number) => `L${r}-${i}`

  // Winner Bracket
  const positions = seedPositions(size)
  for (let i = 0; i < size / 2; i++) {
    const s1 = positions[2 * i]
    const s2 = positions[2 * i + 1]
    add({
      id: wbId(1, i),
      side: 'W',
      round: 1,
      index: i,
      sources: [
        { type: 'seed', entrant: s1 <= n ? seeds[s1 - 1] : null },
        { type: 'seed', entrant: s2 <= n ? seeds[s2 - 1] : null },
      ],
    })
  }
  for (let r = 2; r <= wbRounds; r++) {
    const count = size / 2 ** r
    for (let i = 0; i < count; i++) {
      add({
        id: wbId(r, i),
        side: 'W',
        round: r,
        index: i,
        sources: [
          { type: 'winner', match: wbId(r - 1, 2 * i) },
          { type: 'winner', match: wbId(r - 1, 2 * i + 1) },
        ],
      })
    }
  }

  // Loser Bracket
  if (wbRounds >= 2) {
    for (let i = 0; i < size / 4; i++) {
      add({
        id: lbId(1, i),
        side: 'L',
        round: 1,
        index: i,
        sources: [
          { type: 'loser', match: wbId(1, 2 * i) },
          { type: 'loser', match: wbId(1, 2 * i + 1) },
        ],
      })
    }
    for (let r = 2; r <= wbRounds; r++) {
      const dropRound = 2 * (r - 1)
      const count = size / 2 ** r
      const prev = dropRound - 1
      const perm = chooseDropPermutation(byId, r, count, prev)
      for (let i = 0; i < count; i++) {
        add({
          id: lbId(dropRound, i),
          side: 'L',
          round: dropRound,
          index: i,
          sources: [
            { type: 'winner', match: lbId(prev, i) },
            { type: 'loser', match: wbId(r, perm[i]) },
          ],
        })
      }
      if (r < wbRounds) {
        const cons = dropRound + 1
        for (let i = 0; i < count / 2; i++) {
          add({
            id: lbId(cons, i),
            side: 'L',
            round: cons,
            index: i,
            sources: [
              { type: 'winner', match: lbId(dropRound, 2 * i) },
              { type: 'winner', match: lbId(dropRound, 2 * i + 1) },
            ],
          })
        }
      }
    }
  }

  // Grand Final
  const wbFinal = wbId(wbRounds, 0)
  const lbChampion: Source =
    lbRounds > 0 ? { type: 'winner', match: lbId(lbRounds, 0) } : { type: 'loser', match: wbFinal }
  add({ id: GF1, side: 'GF', round: 1, index: 0, sources: [{ type: 'winner', match: wbFinal }, lbChampion] })
  add({
    id: GF2,
    side: 'GF',
    round: 2,
    index: 0,
    sources: [
      { type: 'winner', match: GF1 },
      { type: 'loser', match: GF1 },
    ],
  })

  // Labels: fortlaufend je Seite
  let w = 0
  let l = 0
  for (const m of matches) {
    if (m.side === 'W') m.label = `W${++w}`
    else if (m.side === 'L') m.label = `L${++l}`
    else m.label = m.id === GF1 ? 'GF' : 'GF2'
  }

  return { size, seeds, wbRounds, lbRounds, matches }
}

/**
 * Wählt, in welches Loser-Bracket-Match die Verlierer einer WB-Runde fallen.
 * Bewertet mehrere übliche Permutationen danach, wie wahrscheinlich ein
 * frühes Rematch ist (frühere Begegnungen im selben WB-Teilbaum, jüngere
 * Begegnungen schwerer gewichtet) und nimmt die beste.
 */
function chooseDropPermutation(
  byId: Map<string, Match>,
  wbRound: number,
  count: number,
  prevLbRound: number,
): number[] {
  const identity = Array.from({ length: count }, (_, i) => i)
  if (count === 1) return identity
  const half = count / 2
  const candidates = [
    identity.map((i) => count - 1 - i), // umgekehrt
    identity.map((i) => (i + half) % count), // Hälften getauscht
    identity.map((i) => (i < half ? half - 1 - i : count - 1 - (i - half))), // je Hälfte umgekehrt
    identity,
  ]

  // Für jedes LB-Match der Vorrunde: aus welchen WB-Matches stammen dessen Verlierer?
  const lbFeeders = (matchId: string, acc: Match[] = []): Match[] => {
    const m = byId.get(matchId)!
    for (const s of m.sources) {
      if (s.type === 'loser') acc.push(byId.get(s.match)!)
      else if (s.type === 'winner') lbFeeders(s.match, acc)
    }
    return acc
  }
  // WB-Match m liegt im Teilbaum von WB-Match (r, i)?
  const inSubtree = (m: Match, r: number, i: number) =>
    m.side === 'W' && m.round < r && Math.floor(m.index / 2 ** (r - m.round)) === i

  const cost = (perm: number[]) => {
    let c = 0
    for (let lbIdx = 0; lbIdx < count; lbIdx++) {
      const wbIdx = perm[lbIdx]
      for (const f of lbFeeders(`L${prevLbRound}-${lbIdx}`)) {
        if (inSubtree(f, wbRound, wbIdx)) c += f.round ** 2
      }
    }
    return c
  }

  let best = candidates[0]
  let bestCost = cost(best)
  for (const p of candidates.slice(1)) {
    const c = cost(p)
    if (c < bestCost) {
      best = p
      bestCost = c
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

const isReal = (s: Slot): s is string => s !== null && s !== BYE

export function computeState(bracket: Bracket, results: Results, opts: Options): TournamentState {
  const byId: Record<string, MatchState> = {}
  const list: MatchState[] = []

  const resolve = (src: Source): Slot => {
    if (src.type === 'seed') return src.entrant ?? BYE
    const st = byId[src.match]
    return src.type === 'winner' ? st.winner : st.loser
  }

  for (const match of bracket.matches) {
    const a = resolve(match.sources[0])
    const b = resolve(match.sources[1])
    const st: MatchState = { match, a, b, winner: null, loser: null, status: 'waiting' }

    if (match.id === GF2) {
      const gf1 = byId[GF1]
      if (!opts.grandFinalReset || (gf1.status === 'done' && gf1.winner === gf1.a)) {
        st.status = 'skipped'
      } else if (gf1.status === 'done') {
        // Revanche: Seiten wie im ersten Finale (WB-Sieger oben)
        st.a = gf1.a
        st.b = gf1.b
        decide(st, results[match.id])
      }
    } else if (a === null || b === null) {
      st.status = 'waiting'
    } else if (a === BYE || b === BYE) {
      st.status = 'bye'
      st.winner = a === BYE ? b : a
      st.loser = BYE
    } else {
      decide(st, results[match.id])
    }

    byId[match.id] = st
    list.push(st)
  }

  const gf1 = byId[GF1]
  const gf2 = byId[GF2]
  let champion: string | null = null
  let runnerUp: string | null = null
  if (gf1.status === 'done') {
    if (gf2.status === 'skipped') {
      champion = gf1.winner
      runnerUp = gf1.loser
    } else if (gf2.status === 'done') {
      champion = gf2.winner
      runnerUp = gf2.loser
    }
  }

  return { byId, list, champion, runnerUp, finished: champion !== null }
}

function decide(st: MatchState, r: MatchResult | undefined) {
  const { a, b } = st
  if (!isReal(a) || !isReal(b)) return
  if (r && r.a === a && r.b === b && (r.winner === a || r.winner === b)) {
    st.status = 'done'
    st.result = r
    st.winner = r.winner
    st.loser = r.winner === a ? b : a
  } else {
    st.status = 'ready'
  }
}

/** Entfernt alle Ergebnisse, die nicht mehr zu den aktuellen Paarungen passen. */
export function pruneResults(bracket: Bracket, results: Results, opts: Options): Results {
  // Wiederholen, bis stabil (ein entferntes Ergebnis kann Folgematches beeinflussen)
  let current = results
  for (;;) {
    const state = computeState(bracket, current, opts)
    const kept: Results = {}
    for (const [id, r] of Object.entries(current)) {
      if (state.byId[id]?.status === 'done') kept[id] = r
    }
    if (Object.keys(kept).length === Object.keys(current).length) return kept
    current = kept
  }
}

export interface ResultChange {
  results: Results
  /** Matches, deren Ergebnis durch die Änderung verworfen wurde */
  invalidated: string[]
}

export function setResult(
  bracket: Bracket,
  results: Results,
  matchId: string,
  winner: string,
  cups: number | undefined,
  opts: Options,
): ResultChange {
  const st = computeState(bracket, results, opts).byId[matchId]
  if (!st) throw new Error(`Unbekanntes Match ${matchId}`)
  if (st.status !== 'ready' && st.status !== 'done') throw new Error(`Match ${matchId} ist nicht spielbereit`)
  if (winner !== st.a && winner !== st.b) throw new Error('Sieger ist kein Teilnehmer dieses Matches')
  const result: MatchResult = { a: st.a as string, b: st.b as string, winner }
  if (cups !== undefined && Number.isFinite(cups)) result.cups = cups
  return applyChange(bracket, results, { ...results, [matchId]: result }, matchId, opts)
}

export function clearResult(bracket: Bracket, results: Results, matchId: string, opts: Options): ResultChange {
  const next = { ...results }
  delete next[matchId]
  return applyChange(bracket, results, next, matchId, opts)
}

function applyChange(bracket: Bracket, before: Results, next: Results, matchId: string, opts: Options): ResultChange {
  const pruned = pruneResults(bracket, next, opts)
  const invalidated = Object.keys(before).filter((id) => id !== matchId && !(id in pruned))
  return { results: pruned, invalidated }
}

// ---------------------------------------------------------------------------
// Abgeleitete Infos für die Anzeige
// ---------------------------------------------------------------------------

const sideOrder: Record<Side, number> = { W: 0, L: 1, GF: 2 }

export function compareMatches(x: Match, y: Match): number {
  return x.depth - y.depth || sideOrder[x.side] - sideOrder[y.side] || x.round - y.round || x.index - y.index
}

/** Spielbereite Matches in sinnvoller Reihenfolge */
export function readyMatches(state: TournamentState): MatchState[] {
  return state.list.filter((s) => s.status === 'ready').sort((x, y) => compareMatches(x.match, y.match))
}

/** Noch nicht spielbereite, aber relevante Matches (mind. ein Teilnehmer bekannt zuerst) */
export function waitingMatches(state: TournamentState): MatchState[] {
  return state.list
    .filter((s) => s.status === 'waiting' && s.match.id !== GF2)
    .sort((x, y) => {
      const kx = (isReal(x.a) ? 1 : 0) + (isReal(x.b) ? 1 : 0)
      const ky = (isReal(y.a) ? 1 : 0) + (isReal(y.b) ? 1 : 0)
      return ky - kx || compareMatches(x.match, y.match)
    })
}

export type EntrantStatus = 'wb' | 'lb' | 'gf' | 'out' | 'champion' | 'runnerUp'

export interface EntrantStats {
  id: string
  wins: number
  losses: number
  cupDiff: number
  played: number
  status: EntrantStatus
}

export function computeStats(bracket: Bracket, state: TournamentState): Record<string, EntrantStats> {
  const stats: Record<string, EntrantStats> = {}
  for (const id of bracket.seeds) stats[id] = { id, wins: 0, losses: 0, cupDiff: 0, played: 0, status: 'wb' }

  for (const st of state.list) {
    if (st.status !== 'done' || !st.result) continue
    const w = stats[st.winner as string]
    const l = stats[st.loser as string]
    const cups = st.result.cups ?? 0
    w.wins++
    w.played++
    w.cupDiff += cups
    l.losses++
    l.played++
    l.cupDiff -= cups
  }

  const gfPlayers = new Set<string>()
  for (const id of [GF1, GF2]) {
    const st = state.byId[id]
    if (st.status === 'ready') [st.a, st.b].forEach((x) => isReal(x) && gfPlayers.add(x))
  }

  for (const s of Object.values(stats)) {
    if (state.finished) s.status = s.id === state.champion ? 'champion' : s.id === state.runnerUp ? 'runnerUp' : 'out'
    else if (s.losses >= 2) s.status = 'out'
    else if (gfPlayers.has(s.id)) s.status = 'gf'
    else s.status = s.losses === 1 ? 'lb' : 'wb'
  }
  return stats
}

/** Alle Matches, die der Teilnehmer gewonnen hat (z. B. für den Siegerpfad). */
export function winningPath(state: TournamentState, entrant: string): Set<string> {
  return new Set(state.list.filter((s) => s.status === 'done' && s.winner === entrant).map((s) => s.match.id))
}

export function roundName(bracket: Bracket, side: Side, round: number): string {
  if (side === 'GF') return round === 1 ? 'Grand Final' : 'Bracket Reset'
  if (side === 'W') {
    const fromEnd = bracket.wbRounds - round
    if (fromEnd === 0) return 'WB-Finale'
    if (fromEnd === 1) return 'WB-Halbfinale'
    if (fromEnd === 2) return 'WB-Viertelfinale'
    return `WB Runde ${round}`
  }
  if (round === bracket.lbRounds) return 'LB-Finale'
  return `LB Runde ${round}`
}

/** Beschreibung einer noch offenen Quelle, z. B. "Sieger W3" */
export function describeSource(bracket: Bracket, src: Source, byes?: Set<string>): string {
  if (byes) src = effectiveSource(bracket, src, byes)
  if (src.type === 'seed') return src.entrant ? '' : 'Freilos'
  const m = bracket.matches.find((x) => x.id === src.match)
  return `${src.type === 'winner' ? 'Sieger' : 'Verlierer'} ${m?.label ?? src.match}`
}

// ---------------------------------------------------------------------------
// Freilos-Struktur (für die Anzeige: Freilos-Matches werden ausgeblendet)
// ---------------------------------------------------------------------------

/**
 * Matches, die wegen eines Freiloses nie gespielt werden – unabhängig von
 * Ergebnissen. Ein Slot ist strukturell ein Freilos, wenn er ein leerer
 * Setzplatz ist, der Sieger eines Freilos-gegen-Freilos-Matches oder der
 * Verlierer eines Freilos-Matches.
 */
export function structuralByes(bracket: Bracket): Set<string> {
  const byeMatch = new Set<string>()
  const doubleBye = new Set<string>()
  const isByeSource = (s: Source): boolean => {
    if (s.type === 'seed') return s.entrant === null
    if (s.type === 'loser') return byeMatch.has(s.match)
    return doubleBye.has(s.match)
  }
  for (const m of bracket.matches) {
    if (m.side === 'GF') continue
    const [x, y] = m.sources.map(isByeSource)
    if (x || y) byeMatch.add(m.id)
    if (x && y) doubleBye.add(m.id)
  }
  return byeMatch
}

/** Folgt einer Quelle durch Freilos-Matches hindurch bis zum echten Ursprung. */
export function effectiveSource(bracket: Bracket, src: Source, byes: Set<string>): Source {
  let cur = src
  for (let guard = 0; guard < 64; guard++) {
    if (cur.type !== 'winner' || !byes.has(cur.match)) return cur
    const id = cur.match
    const m = bracket.matches.find((x) => x.id === id)!
    const real = m.sources.find((s) => !isStructuralBye(bracket, s, byes))
    if (!real) return cur
    cur = real
  }
  return cur
}

function isStructuralBye(bracket: Bracket, s: Source, byes: Set<string>): boolean {
  if (s.type === 'seed') return s.entrant === null
  if (s.type === 'loser') return byes.has(s.match)
  const m = bracket.matches.find((x) => x.id === s.match)!
  return byes.has(m.id) && m.sources.every((x) => isStructuralBye(bracket, x, byes))
}
