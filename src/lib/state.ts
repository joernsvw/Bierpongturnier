import {
  type Bracket,
  type Options,
  type Results,
  type TournamentState,
  computeState,
  generateBracket,
  pruneResults,
} from './bracket'

export type Mode = 'single' | 'double'

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
}

export interface Tournament {
  mode: Mode
  bracket: Bracket
  results: Results
  createdAt: string
}

export interface AppState {
  version: 1
  players: Player[]
  mode: Mode
  teams: Team[]
  /** Spieler, die bei der Auslosung aussetzen */
  paused: string[]
  settings: Settings
  tournament: Tournament | null
}

export const STORAGE_KEY = 'bierpong-turnier-v1'

export const initialState: AppState = {
  version: 1,
  players: [],
  mode: 'double',
  teams: [],
  paused: [],
  settings: { grandFinalReset: true, seeding: 'random' },
  tournament: null,
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}

export function options(state: AppState): Options {
  return { grandFinalReset: state.settings.grandFinalReset }
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

export function parseState(data: unknown): AppState {
  const d = data as Partial<AppState>
  if (!d || typeof d !== 'object' || d.version !== 1 || !Array.isArray(d.players) || !Array.isArray(d.teams)) {
    throw new Error('Keine gültige Turnier-Datei')
  }
  return {
    ...initialState,
    ...d,
    settings: { ...initialState.settings, ...(d.settings ?? {}) },
    paused: Array.isArray(d.paused) ? d.paused : [],
    tournament: d.tournament ?? null,
  } as AppState
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
export function currentEntrants(state: AppState): { id: string; name: string }[] {
  if (state.mode === 'single') return state.players.map((p) => ({ id: p.id, name: p.name }))
  return state.teams.filter((t) => t.playerIds.length > 0).map((t) => ({ id: t.id, name: t.name }))
}

export function entrantName(state: AppState, id: string | null): string {
  if (!id) return ''
  return state.teams.find((t) => t.id === id)?.name ?? state.players.find((p) => p.id === id)?.name ?? '?'
}

export function tournamentState(state: AppState): TournamentState | null {
  if (!state.tournament) return null
  return computeState(state.tournament.bracket, state.tournament.results, options(state))
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

export function startTournament(s: AppState): AppState {
  const entrants = currentEntrants(s)
  const bracket = generateBracket(
    entrants.map((e) => e.id),
    { seeding: s.settings.seeding },
  )
  return { ...s, tournament: { mode: s.mode, bracket, results: {}, createdAt: new Date().toISOString() } }
}

export function withResults(s: AppState, results: Results): AppState {
  if (!s.tournament) return s
  return { ...s, tournament: { ...s.tournament, results } }
}

export function updateSettings(s: AppState, patch: Partial<Settings>): AppState {
  const next = { ...s, settings: { ...s.settings, ...patch } }
  if (next.tournament) {
    next.tournament = {
      ...next.tournament,
      results: pruneResults(next.tournament.bracket, next.tournament.results, options(next)),
    }
  }
  return next
}
