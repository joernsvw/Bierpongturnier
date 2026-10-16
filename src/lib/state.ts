import {
  type Bracket,
  type Options,
  type Results,
  type TournamentState,
  computeState,
  generateBracket,
  labelMatches,
  pruneResults,
  readyMatches,
} from './bracket'
import { type TableAssignment, interleave, reconcileTables } from './tables'

/** Einzel- und Doppel-Turnier laufen unabhängig voneinander, auch gleichzeitig. */
export type Mode = 'single' | 'double'
export const MODES: Mode[] = ['double', 'single']
export const MODE_LABEL: Record<Mode, string> = { single: 'Einzel', double: 'Doppel' }

export interface Player {
  id: string
  name: string
}

export interface Team {
  id: string
  name: string
  /** true, sobald der Name von Hand geändert wurde */
  customName: boolean
  playerIds: string[]
}

export interface Settings {
  grandFinalReset: boolean
  seeding: 'random' | 'order'
  /** Anzahl Tische, an denen gleichzeitig gespielt wird (für beide Turniere zusammen) */
  tables: number
}

export const MAX_TABLES = 4

export interface Tournament {
  bracket: Bracket
  results: Results
  createdAt: string
}

export interface AppState {
  version: 2
  players: Player[]
  /** Turnier, das gerade angezeigt und bearbeitet wird */
  mode: Mode
  teams: Team[]
  /** Spieler, die bei der Doppel-Auslosung aussetzen */
  paused: string[]
  /** Spieler, die beim Einzel nicht mitspielen */
  singleOut: string[]
  settings: Settings
  tournaments: Record<Mode, Tournament | null>
  /** Welches Match an welchem Tisch läuft (Index = Tisch - 1), Schlüssel "modus:matchId" */
  tables: TableAssignment
}

export const STORAGE_KEY = 'bierpong-turnier-v1'

export const initialState: AppState = {
  version: 2,
  players: [],
  mode: 'double',
  teams: [],
  paused: [],
  singleOut: [],
  settings: { grandFinalReset: true, seeding: 'random', tables: 2 },
  tournaments: { single: null, double: null },
  tables: [],
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}

export function options(state: AppState): Options {
  return { grandFinalReset: state.settings.grandFinalReset }
}

export const tableKey = (mode: Mode, matchId: string) => `${mode}:${matchId}`
export const parseTableKey = (key: string) => {
  const i = key.indexOf(':')
  return { mode: key.slice(0, i) as Mode, matchId: key.slice(i + 1) }
}

// ---------------------------------------------------------------------------
// Laden / Speichern / Import
// ---------------------------------------------------------------------------

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    return parseState(JSON.parse(raw))
  } catch {
    return initialState
  }
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Speicher voll oder blockiert – App funktioniert trotzdem weiter
  }
}

interface AnyVersion extends Partial<Omit<AppState, 'version'>> {
  version?: number
  /** Format 1: genau ein Turnier */
  tournament?: (Tournament & { mode: Mode }) | null
}

export function parseState(data: unknown): AppState {
  const d = data as AnyVersion
  if (!d || typeof d !== 'object' || (d.version !== 1 && d.version !== 2) || !Array.isArray(d.players) || !Array.isArray(d.teams)) {
    throw new Error('Keine gültige Turnier-Datei')
  }
  const tournaments: AppState['tournaments'] = { single: null, double: null, ...(d.tournaments ?? {}) }
  if (d.version === 1 && d.tournament) {
    const { mode, bracket, results, createdAt } = d.tournament
    tournaments[mode] = { bracket, results, createdAt }
  }
  // Spielnummern immer nach aktuellem Schema vergeben
  for (const t of Object.values(tournaments)) if (t) labelMatches(t.bracket)

  return syncTables({
    ...initialState,
    players: d.players,
    teams: d.teams,
    mode: d.mode === 'single' ? 'single' : 'double',
    paused: Array.isArray(d.paused) ? d.paused : [],
    singleOut: Array.isArray(d.singleOut) ? d.singleOut : [],
    settings: { ...initialState.settings, ...(d.settings ?? {}) },
    tournaments,
    tables: Array.isArray(d.tables) ? d.tables : [],
  })
}

/** Spieler, die in einem Match eines Turniers stehen */
export function matchPlayers(s: AppState, mode: Mode, a: string | null, b: string | null): string[] {
  const ids = [a, b].filter((x): x is string => !!x)
  if (mode === 'single') return ids
  return ids.flatMap((id) => s.teams.find((t) => t.id === id)?.playerIds ?? [])
}

/**
 * Verteilt spielbereite Matches beider Turniere auf die Tische.
 * Laufende Matches bleiben, wo sie sind; niemand steht an zwei Tischen.
 */
export function syncTables(s: AppState): AppState {
  const ready: Record<Mode, string[]> = { single: [], double: [] }
  const players = new Map<string, string[]>()
  for (const mode of MODES) {
    const t = s.tournaments[mode]
    if (!t) continue
    for (const st of readyMatches(computeState(t.bracket, t.results, options(s)))) {
      const key = tableKey(mode, st.match.id)
      ready[mode].push(key)
      players.set(key, matchPlayers(s, mode, st.a, st.b))
    }
  }
  // Fairness: Das Turnier, das gerade weniger Tische belegt, kommt zuerst dran
  const still = new Set([...ready.single, ...ready.double])
  const onTables = (m: Mode) => s.tables.filter((k) => k && still.has(k) && k.startsWith(`${m}:`)).length
  const order = onTables('single') < onTables('double') ? interleave(ready.single, ready.double) : interleave(ready.double, ready.single)
  const tables = reconcileTables(s.tables, order, s.settings.tables, (k) => players.get(k) ?? [])
  return { ...s, tables }
}

// ---------------------------------------------------------------------------
// Abfragen
// ---------------------------------------------------------------------------

export function autoTeamName(state: Pick<AppState, 'players'>, playerIds: string[]): string {
  const names = playerIds.map((id) => state.players.find((p) => p.id === id)?.name ?? '?')
  if (names.length <= 2) return names.join(' & ')
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/** Spieler, die noch keinem Team angehören und nicht pausieren */
export function drawPool(state: AppState): Player[] {
  const assigned = new Set(state.teams.flatMap((t) => t.playerIds))
  return state.players.filter((p) => !assigned.has(p.id) && !state.paused.includes(p.id))
}

/** Teilnehmer, die beim Turnierstart ins Bracket kommen */
export function currentEntrants(state: AppState, mode: Mode = state.mode): { id: string; name: string }[] {
  if (mode === 'single') return state.players.filter((p) => !state.singleOut.includes(p.id)).map((p) => ({ id: p.id, name: p.name }))
  return state.teams.filter((t) => t.playerIds.length > 0).map((t) => ({ id: t.id, name: t.name }))
}

/** Turnier eines Modus (Standard: der gerade gewählte) */
export function current(state: AppState, mode: Mode = state.mode): Tournament | null {
  return state.tournaments[mode]
}

/** Spieler, die in einem laufenden Turnier stecken (dürfen nicht gelöscht werden) */
export function lockedPlayers(state: AppState): Set<string> {
  const ids = new Set<string>()
  const single = state.tournaments.single
  if (single) single.bracket.seeds.forEach((id) => ids.add(id))
  const double = state.tournaments.double
  if (double) {
    for (const t of state.teams) if (double.bracket.seeds.includes(t.id)) t.playerIds.forEach((id) => ids.add(id))
  }
  return ids
}

export function entrantName(state: AppState, id: string | null): string {
  if (!id) return ''
  return state.teams.find((t) => t.id === id)?.name ?? state.players.find((p) => p.id === id)?.name ?? '?'
}

export function tournamentState(state: AppState, mode: Mode = state.mode): TournamentState | null {
  const t = state.tournaments[mode]
  if (!t) return null
  return computeState(t.bracket, t.results, options(state))
}

// ---------------------------------------------------------------------------
// Änderungen (rein funktional, jede liefert einen neuen Zustand)
// ---------------------------------------------------------------------------

const refreshTeamNames = (s: AppState): AppState => ({
  ...s,
  teams: s.teams.map((t) => (t.customName ? t : { ...t, name: autoTeamName(s, t.playerIds) })),
})

export function addPlayer(s: AppState, name: string): AppState {
  const trimmed = name.trim()
  if (!trimmed) return s
  return { ...s, players: [...s.players, { id: uid(), name: trimmed }] }
}

export function renamePlayer(s: AppState, id: string, name: string): AppState {
  const trimmed = name.trim()
  if (!trimmed) return s
  return refreshTeamNames({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, name: trimmed } : p)) })
}

export function removePlayer(s: AppState, id: string): AppState {
  return refreshTeamNames({
    ...s,
    players: s.players.filter((p) => p.id !== id),
    paused: s.paused.filter((x) => x !== id),
    singleOut: s.singleOut.filter((x) => x !== id),
    teams: s.teams.map((t) => ({ ...t, playerIds: t.playerIds.filter((x) => x !== id) })).filter((t) => t.playerIds.length > 0),
  })
}

export function movePlayer(s: AppState, id: string, dir: -1 | 1): AppState {
  const i = s.players.findIndex((p) => p.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= s.players.length) return s
  const players = [...s.players]
  ;[players[i], players[j]] = [players[j], players[i]]
  return { ...s, players }
}

export function togglePaused(s: AppState, id: string): AppState {
  const paused = s.paused.includes(id) ? s.paused.filter((x) => x !== id) : [...s.paused, id]
  return { ...s, paused, teams: s.teams.map((t) => ({ ...t, playerIds: t.playerIds.filter((x) => x !== id) })).filter((t) => t.playerIds.length > 0) }
}

export function toggleSingleOut(s: AppState, id: string): AppState {
  const singleOut = s.singleOut.includes(id) ? s.singleOut.filter((x) => x !== id) : [...s.singleOut, id]
  return { ...s, singleOut }
}

export function createTeam(s: AppState, playerIds: string[]): AppState {
  if (playerIds.length === 0) return s
  const team: Team = { id: uid(), name: autoTeamName(s, playerIds), customName: false, playerIds }
  return { ...s, teams: [...s.teams, team] }
}

export function renameTeam(s: AppState, id: string, name: string): AppState {
  const trimmed = name.trim()
  return {
    ...s,
    teams: s.teams.map((t) =>
      t.id !== id ? t : trimmed ? { ...t, name: trimmed, customName: true } : { ...t, name: autoTeamName(s, t.playerIds), customName: false },
    ),
  }
}

export function addToTeam(s: AppState, teamId: string, playerId: string): AppState {
  const cleaned = s.teams.map((t) => ({ ...t, playerIds: t.playerIds.filter((x) => x !== playerId) }))
  return refreshTeamNames({
    ...s,
    paused: s.paused.filter((x) => x !== playerId),
    teams: cleaned.map((t) => (t.id === teamId ? { ...t, playerIds: [...t.playerIds, playerId] } : t)).filter((t) => t.playerIds.length > 0),
  })
}

export function removeFromTeam(s: AppState, teamId: string, playerId: string): AppState {
  return refreshTeamNames({
    ...s,
    teams: s.teams
      .map((t) => (t.id === teamId ? { ...t, playerIds: t.playerIds.filter((x) => x !== playerId) } : t))
      .filter((t) => t.playerIds.length > 0),
  })
}

export function removeTeam(s: AppState, teamId: string): AppState {
  return { ...s, teams: s.teams.filter((t) => t.id !== teamId) }
}

const setTournament = (s: AppState, mode: Mode, t: Tournament | null): AppState =>
  syncTables({ ...s, tournaments: { ...s.tournaments, [mode]: t } })

export function startTournament(s: AppState, mode: Mode = s.mode): AppState {
  const entrants = currentEntrants(s, mode)
  const bracket = generateBracket(
    entrants.map((e) => e.id),
    { seeding: s.settings.seeding },
  )
  return setTournament(s, mode, { bracket, results: {}, createdAt: new Date().toISOString() })
}

export function discardTournament(s: AppState, mode: Mode = s.mode): AppState {
  return setTournament(s, mode, null)
}

export function withResults(s: AppState, results: Results, mode: Mode = s.mode): AppState {
  const t = s.tournaments[mode]
  if (!t) return s
  return setTournament(s, mode, { ...t, results })
}

export function updateSettings(s: AppState, patch: Partial<Settings>): AppState {
  const next = { ...s, settings: { ...s.settings, ...patch } }
  const tournaments = { ...next.tournaments }
  for (const mode of MODES) {
    const t = tournaments[mode]
    if (t) tournaments[mode] = { ...t, results: pruneResults(t.bracket, t.results, options(next)) }
  }
  return syncTables({ ...next, tournaments })
}
