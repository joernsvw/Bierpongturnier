import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeStats, readyMatches, structuralByes, waitingMatches, winningPath } from './lib/bracket'
import * as S from './lib/state'
import { interleave } from './lib/tables'
import { useDraw } from './lib/useDraw'
import { useStore } from './lib/useStore'
import { BracketView } from './components/BracketView'
import { MatchModal } from './components/MatchModal'
import { ConfirmProvider, Modal, useConfirm } from './components/Modal'
import { PlayersPanel } from './components/PlayersPanel'
import { SetupStage, TablesSelect } from './components/SetupStage'
import { StatsPanel } from './components/StatsPanel'
import { TeamsPanel } from './components/TeamsPanel'
import { type MatchItem, UpNext } from './components/UpNext'
import { WinnerOverlay } from './components/WinnerOverlay'

export default function App() {
  return (
    <ConfirmProvider>
      <Main />
    </ConfirmProvider>
  )
}

type Tab = 'players' | 'teams' | 'stats'

function Main() {
  const store = useStore()
  const { state, commit, update, undo, canUndo, undoLabel } = store
  const draw = useDraw(store)
  const confirm = useConfirm()

  const mode = state.mode
  const [presentation, setPresentation] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<Tab>(state.tournaments[mode] ? 'stats' : 'players')
  const [openMatch, setOpenMatch] = useState<{ mode: S.Mode; id: string } | null>(null)
  const [showWinner, setShowWinner] = useState<S.Mode | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Beide Turniere werden immer ausgewertet (Tische sind gemeinsam)
  const tstates = useMemo(
    () => ({ single: S.tournamentState(state, 'single'), double: S.tournamentState(state, 'double') }),
    [state],
  )
  const t = state.tournaments[mode]
  const tstate = tstates[mode]
  const stats = useMemo(() => (t && tstate ? computeStats(t.bracket, tstate) : null), [t, tstate])
  const name = useCallback((id: string | null) => S.entrantName(state, id), [state])
  const bothRunning = S.MODES.every((m) => state.tournaments[m] !== null)
  const anyRunning = S.MODES.some((m) => state.tournaments[m] !== null)

  // --- Tische und Warteschlange (über beide Turniere) -----------------------
  const { tableItems, queue, tableOf, nextIds } = useMemo(() => {
    const item = (m: S.Mode, id: string): MatchItem | null => {
      const ts = tstates[m]
      const tt = state.tournaments[m]
      return ts && tt && ts.byId[id] ? { mode: m, st: ts.byId[id], bracket: tt.bracket } : null
    }
    const tableItems = Array.from({ length: state.settings.tables }, (_, i) => {
      const key = state.tables[i]
      if (!key) return null
      const { mode: m, matchId } = S.parseTableKey(key)
      return item(m, matchId)
    })
    const onTable = new Set(state.tables.filter(Boolean))
    const busy = new Set(tableItems.flatMap((it) => (it ? S.matchPlayers(state, it.mode, it.st.a, it.st.b) : [])))
    const withBlocked = (it: MatchItem): MatchItem => ({
      ...it,
      blocked: S.matchPlayers(state, it.mode, it.st.a, it.st.b).some((p) => busy.has(p)),
    })
    const readyOf = (m: S.Mode) =>
      tstates[m]
        ? readyMatches(tstates[m]!)
            .map((st) => withBlocked(item(m, st.match.id)!))
            .filter((it) => !onTable.has(S.tableKey(m, it.st.match.id)))
        : []
    const waitingOf = (m: S.Mode) => (tstates[m] ? waitingMatches(tstates[m]!).map((st) => item(m, st.match.id)!) : [])
    const ready = interleave(readyOf('double'), readyOf('single'))
    // Wer sofort an einen freien Tisch könnte, steht vorne
    const queue = [...ready.filter((it) => !it.blocked), ...ready.filter((it) => it.blocked), ...interleave(waitingOf('double'), waitingOf('single'))]

    const tableOf = new Map<string, number>()
    tableItems.forEach((it, i) => it && it.mode === mode && tableOf.set(it.st.match.id, i + 1))
    const nextIds = new Set(
      queue
        .filter((it) => it.mode === mode && it.st.status === 'ready')
        .slice(0, 2)
        .map((it) => it.st.match.id),
    )
    return { tableItems, queue, tableOf, nextIds }
  }, [state, tstates, mode])

  const champions = S.MODES.flatMap((m) => (tstates[m]?.champion ? [{ mode: m, name: name(tstates[m]!.champion) }] : []))

  // Siegerpfad: am Ende der Weg des Champions
  const path = useMemo(() => (tstate?.champion ? winningPath(tstate, tstate.champion) : new Set<string>()), [tstate])

  // Nach dem Turnierstart direkt die Tabelle zeigen
  const hadTournament = useRef(t !== null)
  useEffect(() => {
    if (t && !hadTournament.current) setTab('stats')
    hadTournament.current = t !== null
  }, [t])

  // Siegerehrung automatisch zeigen, sobald durch ein eingetragenes Ergebnis ein Champion feststeht
  // (nicht nach Undo, Import oder Reload)
  const resultSaved = useRef<S.Mode | null>(null)
  useEffect(() => {
    const m = resultSaved.current
    if (m && tstates[m]?.champion) setShowWinner(m)
    resultSaved.current = null
  }, [tstates])

  const switchMode = (m: S.Mode) => {
    if (m === mode) return
    update((s) => ({ ...s, mode: m }))
    setTab(state.tournaments[m] ? 'stats' : m === 'double' ? 'teams' : 'players')
  }

  // --- Präsentationsmodus / Tastatur ----------------------------------------
  const togglePresentation = useCallback(() => {
    setPresentation((p) => {
      const next = !p
      if (next) document.documentElement.requestFullscreen?.().catch(() => {})
      else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      return next
    })
  }, [])

  useEffect(() => {
    const onFs = () => !document.fullscreenElement && setPresentation(false)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return
      if (openMatch || showSettings) return
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        togglePresentation()
      } else if (e.key === 'Escape' && presentation) {
        togglePresentation()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePresentation, undo, presentation, openMatch, showSettings])

  // --- Turnier-Aktionen ------------------------------------------------------
  const label = S.MODE_LABEL[mode]
  const resetTournament = async () => {
    if (await confirm({ title: `${label} zurücksetzen?`, message: 'Alle Ergebnisse dieses Turniers werden gelöscht. Der Turnierbaum und die Paarungen bleiben erhalten.', confirmLabel: 'Ergebnisse löschen', danger: true }))
      commit((s) => S.withResults(s, {}), `${label} zurückgesetzt`)
  }
  const newTournament = async () => {
    if (await confirm({ title: `${label} neu erstellen?`, message: 'Der Turnierbaum samt Ergebnissen wird verworfen. Spieler und Teams bleiben erhalten.', confirmLabel: 'Turnier verwerfen', danger: true })) {
      commit((s) => S.discardTournament(s), `${label} verworfen`)
      setTab(mode === 'double' ? 'teams' : 'players')
    }
  }
  const wipeAll = async () => {
    if (await confirm({ title: 'Alles löschen?', message: 'Spieler, Teams und beide Turniere werden komplett gelöscht. (Rückgängig ist möglich, solange die Seite offen bleibt.)', confirmLabel: 'Alles löschen', danger: true })) {
      commit(S.initialState, 'Alles gelöscht')
      setShowSettings(false)
      setTab('players')
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    a.href = URL.createObjectURL(blob)
    a.download = `bierpong-turnier-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = async (file: File) => {
    try {
      const next = S.parseState(JSON.parse(await file.text()))
      if (await confirm({ title: 'Backup importieren?', message: `Der aktuelle Stand wird durch „${file.name}“ ersetzt.`, confirmLabel: 'Importieren' })) {
        commit(next, 'Backup importiert')
        setTab(next.tournaments[next.mode] ? 'stats' : 'players')
      }
    } catch (err) {
      await confirm({ title: 'Import fehlgeschlagen', message: err instanceof Error ? err.message : String(err), confirmLabel: 'OK' })
    }
  }

  // Fortschritt je Turnier: ohne Freilose, Bracket Reset nur wenn er nötig ist
  const progress = (m: S.Mode) => {
    const tt = state.tournaments[m]
    const ts = tstates[m]
    if (!tt || !ts) return null
    const byes = structuralByes(tt.bracket)
    const done = ts.list.filter((s) => s.status === 'done').length
    const total = ts.list.filter((s) => !byes.has(s.match.id) && (s.match.id !== 'GF2' || s.status === 'ready' || s.status === 'done')).length
    return { done, total, finished: ts.finished }
  }

  const champTeam = showWinner && tstates[showWinner]?.champion ? state.teams.find((x) => x.id === tstates[showWinner]!.champion) : undefined
  const openT = openMatch ? state.tournaments[openMatch.mode] : null
  const openSt = openMatch ? (tstates[openMatch.mode]?.byId[openMatch.id] ?? null) : null

  const tabs: { id: Tab; label: string }[] = [
    { id: 'players', label: 'Spieler' },
    ...(mode === 'double' ? [{ id: 'teams' as Tab, label: 'Teams' }] : []),
    { id: 'stats', label: 'Tabelle' },
  ]
  const activeTab = tabs.some((x) => x.id === tab) ? tab : 'players'

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Kopfzeile */}
      <header className="flex items-center gap-4">
        <h1 className="flex shrink-0 items-center gap-3 leading-none">
          <img src={`${import.meta.env.BASE_URL}tsv-logo.png`} alt="TSV Worphausen" className="h-14 w-auto drop-shadow" />
          <span className="flex flex-col">
            <span className="text-sm font-bold uppercase tracking-[0.25em] text-wb">TSV Worphausen</span>
            <span className="font-display whitespace-nowrap text-[44px]">
              <span className="text-beer">Bierpong</span> <span className="text-text">Turnier</span>
            </span>
          </span>
        </h1>

        {/* Umschalter Doppel / Einzel */}
        <nav className="ml-6 flex shrink-0 gap-1 rounded-2xl border border-line bg-bg/60 p-1">
          {S.MODES.map((m) => {
            const p = progress(m)
            const active = m === mode
            return (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex min-w-40 flex-col items-start rounded-xl px-4 py-1.5 text-left transition ${active ? 'bg-club text-white' : 'text-muted hover:bg-panel-2 hover:text-text'}`}
              >
                <span className="text-2xl font-extrabold leading-tight">{S.MODE_LABEL[m]}</span>
                <span className="flex w-full items-center gap-2 text-sm font-semibold">
                  {p ? (
                    p.finished ? (
                      <span>🏆 beendet</span>
                    ) : (
                      <>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/30">
                          <span className="block h-full rounded-full bg-beer" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
                        </span>
                        <span>
                          {p.done}/{p.total}
                        </span>
                      </>
                    )
                  ) : (
                    <span>Vorbereitung</span>
                  )}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {!presentation && (
            <>
              <button className="btn" disabled={!canUndo} onClick={undo} title={undoLabel ? `Rückgängig: ${undoLabel} (Strg+Z)` : 'Nichts rückgängig zu machen'}>
                ↶ Rückgängig
              </button>
              {t && (
                <>
                  <button className="btn" onClick={resetTournament}>
                    {label} zurücksetzen
                  </button>
                  <button className="btn btn-danger" onClick={newTournament}>
                    Neu erstellen
                  </button>
                </>
              )}
              <button className="btn" onClick={() => setShowSettings(true)} title="Einstellungen, Export & Import">
                ⚙ Menü
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={togglePresentation} title="Taste F">
            {presentation ? '✕ Präsentation beenden' : '📺 Präsentation (F)'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Links: Teilnehmer & Teams */}
        {!presentation && collapsed && (
          <button className="panel flex w-14 shrink-0 flex-col items-center gap-4 py-4 text-muted hover:text-beer" onClick={() => setCollapsed(false)} title="Seitenleiste ausklappen">
            <span className="text-2xl">»</span>
            <span className="text-lg font-bold [writing-mode:vertical-rl]">Spieler · Teams · Tabelle</span>
          </button>
        )}
        {!presentation && !collapsed && (
          <aside className="panel flex w-[420px] shrink-0 flex-col p-4">
            <nav className="mb-4 flex gap-1 rounded-xl bg-bg/60 p-1">
              {tabs.map((x) => (
                <button
                  key={x.id}
                  onClick={() => setTab(x.id)}
                  className={`flex-1 rounded-lg py-2 text-lg font-bold transition ${activeTab === x.id ? 'bg-panel-2 text-beer shadow' : 'text-muted hover:text-text'}`}
                >
                  {x.label}
                </button>
              ))}
              <button className="rounded-lg px-3 text-xl text-muted hover:text-beer" onClick={() => setCollapsed(true)} title="Seitenleiste einklappen">
                «
              </button>
            </nav>
            <div className="min-h-0 flex-1">
              {activeTab === 'players' && <PlayersPanel store={store} />}
              {activeTab === 'teams' && <TeamsPanel store={store} draw={draw} locked={state.tournaments.double !== null} />}
              {activeTab === 'stats' && <StatsPanel state={state} stats={stats} />}
            </div>
          </aside>
        )}

        {/* Mitte: Turnierbaum bzw. Auslosung */}
        <main className="panel min-w-0 flex-1 overflow-hidden">
          {t && tstate ? (
            <BracketView
              key={mode}
              bracket={t.bracket}
              state={tstate}
              name={name}
              onOpen={(id) => setOpenMatch({ mode, id })}
              tableOf={tableOf}
              nextIds={nextIds}
              highlightPath={path}
              fitKey={`${presentation}-${collapsed}-${state.settings.grandFinalReset}`}
              showReset={state.settings.grandFinalReset}
              controls={!presentation}
            />
          ) : (
            <SetupStage store={store} draw={draw} />
          )}
        </main>

        {/* Rechts: Tische und Als Nächstes (beide Turniere) */}
        {anyRunning && (
          <aside className={`shrink-0 ${presentation ? 'w-[520px]' : 'w-[400px]'}`}>
            <UpNext
              tables={tableItems}
              queue={queue}
              champions={champions}
              showMode={bothRunning}
              name={name}
              onOpen={(m, id) => setOpenMatch({ mode: m, id })}
              onShowWinner={setShowWinner}
              big={presentation}
            />
          </aside>
        )}
      </div>

      {openMatch && openT && (
        <MatchModal
          st={openSt}
          bracket={openT.bracket}
          results={openT.results}
          opts={S.options(state)}
          name={name}
          onClose={() => setOpenMatch(null)}
          onSave={(results, lbl) => {
            const m = openMatch.mode
            resultSaved.current = m
            commit((s) => S.withResults(s, results, m), `${S.MODE_LABEL[m]}: ${lbl}`)
          }}
        />
      )}

      {showWinner && tstates[showWinner]?.champion && (
        <WinnerOverlay
          title={bothRunning ? `${S.MODE_LABEL[showWinner]}-Sieger` : 'Turniersieger'}
          name={name(tstates[showWinner]!.champion)}
          members={champTeam?.customName ? champTeam.playerIds.map((id) => state.players.find((p) => p.id === id)?.name).join(' & ') : undefined}
          onClose={() => setShowWinner(null)}
        />
      )}

      <Modal open={showSettings} onClose={() => setShowSettings(false)}>
        <h2 className="font-display text-5xl text-beer">Menü</h2>
        <div className="mt-6 space-y-6 text-lg">
          <section className="space-y-3">
            <h3 className="font-bold text-muted">Turnier-Einstellungen (Einzel und Doppel)</h3>
            <TablesSelect store={store} />
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="h-6 w-6 accent-[#0d7e35]"
                checked={state.settings.grandFinalReset}
                onChange={async (e) => {
                  const on = e.target.checked
                  if (!on && S.MODES.some((m) => tstates[m]?.byId.GF2.status === 'done')) {
                    const ok = await confirm({ title: 'Bracket Reset abschalten?', message: 'Das bereits eingetragene zweite Finale wird dadurch gelöscht.', confirmLabel: 'Abschalten', danger: true })
                    if (!ok) return
                  }
                  commit((s) => S.updateSettings(s, { grandFinalReset: on }), 'Einstellung geändert')
                }}
              />
              <span>Bracket Reset (zweites Finale, wenn der Loser-Bracket-Sieger das Grand Final gewinnt)</span>
            </label>
            <label className="flex items-center gap-3">
              <span>Erstrunden-Paarungen</span>
              <select
                className="input w-auto py-2"
                value={state.settings.seeding}
                onChange={(e) => commit((s) => S.updateSettings(s, { seeding: e.target.value as S.Settings['seeding'] }), 'Einstellung geändert')}
              >
                <option value="random">per Zufall</option>
                <option value="order">nach Reihenfolge (Setzliste)</option>
              </select>
              {anyRunning && <span className="text-sm text-muted">(gilt beim nächsten Start)</span>}
            </label>
          </section>
          <section className="space-y-3">
            <h3 className="font-bold text-muted">Backup</h3>
            <div className="flex flex-wrap gap-3">
              <button className="btn" onClick={exportJson}>
                ⬇ Export als JSON
              </button>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                ⬆ Import aus JSON
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) {
                    setShowSettings(false)
                    void importJson(f)
                  }
                }}
              />
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="font-bold text-muted">Tastenkürzel</h3>
            <ul className="space-y-1 text-muted">
              <li>
                <Kbd>F</Kbd> Präsentationsmodus / Vollbild
              </li>
              <li>
                <Kbd>Strg</Kbd> + <Kbd>Z</Kbd> Rückgängig
              </li>
              <li>
                Im Ergebnis-Fenster: <Kbd>1</Kbd> / <Kbd>2</Kbd> Sieger wählen, <Kbd>Enter</Kbd> speichern
              </li>
              <li>Turnierbaum: Mausrad zoomt, Ziehen verschiebt</li>
            </ul>
          </section>
          <section className="flex items-center justify-between border-t border-line pt-5">
            <button className="btn btn-danger" onClick={wipeAll}>
              Alles löschen
            </button>
            <button className="btn btn-primary" onClick={() => setShowSettings(false)}>
              Schließen
            </button>
          </section>
        </div>
      </Modal>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-line bg-panel-2 px-2 py-0.5 font-mono text-base text-text">{children}</kbd>
}
