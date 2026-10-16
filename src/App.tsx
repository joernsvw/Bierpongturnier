import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeStats, readyMatches, structuralByes, waitingMatches, winningPath } from './lib/bracket'
import * as S from './lib/state'
import { useDraw } from './lib/useDraw'
import { useStore } from './lib/useStore'
import { BracketView } from './components/BracketView'
import { MatchModal } from './components/MatchModal'
import { ConfirmProvider, Modal, useConfirm } from './components/Modal'
import { PlayersPanel } from './components/PlayersPanel'
import { SetupStage } from './components/SetupStage'
import { StatsPanel } from './components/StatsPanel'
import { TeamsPanel } from './components/TeamsPanel'
import { UpNext } from './components/UpNext'
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
  const { state, commit, undo, canUndo, undoLabel } = store
  const draw = useDraw(store)
  const confirm = useConfirm()

  const [presentation, setPresentation] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<Tab>(state.tournament ? 'stats' : 'players')
  const [openMatch, setOpenMatch] = useState<string | null>(null)
  const [showWinner, setShowWinner] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const t = state.tournament
  const tstate = useMemo(() => S.tournamentState(state), [state])
  const stats = useMemo(() => (t && tstate ? computeStats(t.bracket, tstate) : null), [t, tstate])
  const ready = useMemo(() => (tstate ? readyMatches(tstate) : []), [tstate])
  const waiting = useMemo(() => (tstate ? waitingMatches(tstate) : []), [tstate])
  const name = useCallback((id: string | null) => S.entrantName(state, id), [state])
  const locked = t !== null

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
  const resultSaved = useRef(false)
  useEffect(() => {
    if (resultSaved.current && tstate?.champion) setShowWinner(true)
    resultSaved.current = false
  }, [tstate?.champion])

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
  const resetTournament = async () => {
    if (await confirm({ title: 'Turnier zurücksetzen?', message: 'Alle Ergebnisse werden gelöscht. Der Turnierbaum und die Paarungen bleiben erhalten.', confirmLabel: 'Ergebnisse löschen', danger: true }))
      commit((s) => S.withResults(s, {}), 'Turnier zurückgesetzt')
  }
  const newTournament = async () => {
    if (await confirm({ title: 'Neues Turnier erstellen?', message: 'Der aktuelle Turnierbaum samt Ergebnissen wird verworfen. Spieler und Teams bleiben erhalten.', confirmLabel: 'Turnier verwerfen', danger: true })) {
      commit((s) => ({ ...s, tournament: null }), 'Turnier verworfen')
      setTab(state.mode === 'double' ? 'teams' : 'players')
    }
  }
  const wipeAll = async () => {
    if (await confirm({ title: 'Alles löschen?', message: 'Spieler, Teams und Turnier werden komplett gelöscht. (Rückgängig ist möglich, solange die Seite offen bleibt.)', confirmLabel: 'Alles löschen', danger: true })) {
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
        setTab(next.tournament ? 'stats' : 'players')
      }
    } catch (err) {
      await confirm({ title: 'Import fehlgeschlagen', message: err instanceof Error ? err.message : String(err), confirmLabel: 'OK' })
    }
  }

  const done = tstate ? tstate.list.filter((s) => s.status === 'done').length : 0
  // Gesamtzahl der zu spielenden Matches: ohne Freilose, Bracket Reset nur wenn er nötig ist
  const byes = useMemo(() => (t ? structuralByes(t.bracket) : new Set<string>()), [t])
  const total = tstate
    ? tstate.list.filter((s) => !byes.has(s.match.id) && (s.match.id !== 'GF2' || s.status === 'ready' || s.status === 'done')).length
    : 0
  const champTeam = tstate?.champion ? state.teams.find((x) => x.id === tstate.champion) : undefined
  const openSt = openMatch && tstate ? tstate.byId[openMatch] : null

  const tabs: { id: Tab; label: string }[] = [
    { id: 'players', label: 'Spieler' },
    ...(state.mode === 'double' ? [{ id: 'teams' as Tab, label: 'Teams' }] : []),
    { id: 'stats', label: 'Tabelle' },
  ]
  const activeTab = tabs.some((x) => x.id === tab) ? tab : 'players'

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Kopfzeile */}
      <header className="flex items-center gap-4">
        <h1 className="flex items-center gap-3 leading-none">
          <img src={`${import.meta.env.BASE_URL}tsv-logo.png`} alt="TSV Worphausen" className="h-14 w-auto drop-shadow" />
          <span className="flex flex-col">
            <span className="text-sm font-bold uppercase tracking-[0.25em] text-wb">TSV Worphausen</span>
            <span className="font-display whitespace-nowrap text-5xl">
              <span className="text-beer">Bierpong</span> <span className="text-text">Turnier</span>
            </span>
          </span>
        </h1>
        {t && (
          <div className="ml-4 flex items-center gap-3 text-xl text-muted">
            <div className="h-3 w-48 overflow-hidden rounded-full bg-panel-2">
              <div className="h-full rounded-full bg-beer transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
            <span className="font-semibold">
              {done}/{total} Matches
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!presentation && (
            <>
              <button className="btn" disabled={!canUndo} onClick={undo} title={undoLabel ? `Rückgängig: ${undoLabel} (Strg+Z)` : 'Nichts rückgängig zu machen'}>
                ↶ Rückgängig
              </button>
              {t && (
                <>
                  <button className="btn" onClick={resetTournament}>
                    Turnier zurücksetzen
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
              {activeTab === 'players' && <PlayersPanel store={store} locked={locked} />}
              {activeTab === 'teams' && <TeamsPanel store={store} draw={draw} locked={locked} />}
              {activeTab === 'stats' && <StatsPanel state={state} stats={stats} />}
            </div>
          </aside>
        )}

        {/* Mitte: Turnierbaum bzw. Auslosung */}
        <main className="panel min-w-0 flex-1 overflow-hidden">
          {t && tstate ? (
            <BracketView
              bracket={t.bracket}
              state={tstate}
              name={name}
              onOpen={setOpenMatch}
              nowId={ready[0]?.match.id ?? null}
              nextIds={new Set(ready.slice(1, 3).map((s) => s.match.id))}
              highlightPath={path}
              fitKey={`${presentation}-${collapsed}-${state.settings.grandFinalReset}`}
              showReset={state.settings.grandFinalReset}
              controls={!presentation}
            />
          ) : (
            <SetupStage store={store} draw={draw} />
          )}
        </main>

        {/* Rechts: Als Nächstes */}
        {t && tstate && (
          <aside className={`shrink-0 ${presentation ? 'w-[520px]' : 'w-[400px]'}`}>
            <UpNext
              bracket={t.bracket}
              ready={ready}
              waiting={waiting}
              champion={tstate.champion}
              name={name}
              onOpen={setOpenMatch}
              onShowWinner={() => setShowWinner(true)}
              big={presentation}
            />
          </aside>
        )}
      </div>

      {t && (
        <MatchModal
          st={openSt}
          bracket={t.bracket}
          results={t.results}
          opts={S.options(state)}
          name={name}
          onClose={() => setOpenMatch(null)}
          onSave={(results, label) => {
            resultSaved.current = true
            commit((s) => S.withResults(s, results), label)
          }}
        />
      )}

      {showWinner && tstate?.champion && (
        <WinnerOverlay
          name={name(tstate.champion)}
          members={champTeam && !champTeam.customName ? undefined : champTeam?.playerIds.map((id) => state.players.find((p) => p.id === id)?.name).join(' & ')}
          onClose={() => setShowWinner(false)}
        />
      )}

      <Modal open={showSettings} onClose={() => setShowSettings(false)}>
        <h2 className="font-display text-5xl text-beer">Menü</h2>
        <div className="mt-6 space-y-6 text-lg">
          <section className="space-y-3">
            <h3 className="font-bold text-muted">Turnier-Einstellungen</h3>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="h-6 w-6 accent-[#0d7e35]"
                checked={state.settings.grandFinalReset}
                onChange={async (e) => {
                  const on = e.target.checked
                  if (!on && tstate && tstate.byId.GF2.status === 'done') {
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
                disabled={locked}
                value={state.settings.seeding}
                onChange={(e) => commit((s) => S.updateSettings(s, { seeding: e.target.value as S.Settings['seeding'] }), 'Einstellung geändert')}
              >
                <option value="random">per Zufall</option>
                <option value="order">nach Reihenfolge (Setzliste)</option>
              </select>
              {locked && <span className="text-sm text-muted">(gilt beim nächsten Turnier)</span>}
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
