import { useState } from 'react'
import * as S from '../lib/state'
import type { Draw } from '../lib/useDraw'
import type { Store } from '../lib/useStore'
import { useConfirm } from './Modal'
import { IconBtn } from './PlayersPanel'

export function TeamsPanel({ store, draw, locked }: { store: Store; draw: Draw; locked: boolean }) {
  const { state, commit } = store
  const confirm = useConfirm()
  const pool = S.drawPool(state)
  const [selected, setSelected] = useState<string[]>([])
  const sel = selected.filter((id) => pool.some((p) => p.id === id))
  const pname = (id: string) => state.players.find((p) => p.id === id)?.name ?? '?'

  const resetDraw = async () => {
    if (await confirm({ title: 'Auslosung zurücksetzen?', message: 'Alle Teams werden aufgelöst, die Spieler kommen zurück in den Lostopf.', confirmLabel: 'Zurücksetzen', danger: true }))
      draw.reset()
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {!locked && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-primary col-span-2 py-3 text-xl" onClick={draw.next} disabled={draw.spinning || pool.length < 2}>
            🎡 Nächstes Team losen
          </button>
          <button className="btn text-base" onClick={draw.all} disabled={draw.spinning || pool.length < 2}>
            Alle auf einmal
          </button>
          <button className="btn btn-danger text-base" onClick={resetDraw} disabled={draw.spinning || state.teams.length === 0}>
            Zurücksetzen
          </button>
        </div>
      )}

      {!locked && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-bold text-muted">Lostopf ({pool.length})</h3>
            {sel.length > 0 && (
              <button
                className="btn py-1.5 text-base"
                onClick={() => {
                  commit((s) => S.createTeam(s, sel), 'Team manuell erstellt')
                  setSelected([])
                }}
              >
                Team aus Auswahl ({sel.length})
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {pool.map((p) => {
              const on = sel.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(on ? sel.filter((x) => x !== p.id) : [...sel, p.id])}
                  className={`rounded-full border-2 px-3 py-1 text-lg font-semibold transition ${
                    on ? 'border-beer bg-beer/20 text-beer' : 'border-line bg-panel-2 hover:border-beer/60'
                  }`}
                >
                  {p.name}
                </button>
              )
            })}
            {pool.length === 0 && <span className="text-muted">leer – alle Spieler sind verteilt</span>}
          </div>
          {pool.length > 1 && <p className="mt-2 text-sm text-muted">Tipp: Spieler antippen, um ein Team von Hand zu bilden.</p>}
          {pool.length === 1 && state.teams.length > 0 && (
            <div className="mt-3">
              <OddPlayerChoice store={store} playerId={pool[0].id} compact />
            </div>
          )}
        </section>
      )}

      <section className="flex min-h-0 flex-1 flex-col">
        <h3 className="mb-2 text-lg font-bold text-muted">Teams ({state.teams.length})</h3>
        <ul className="-mr-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-2">
          {state.teams.map((t) => (
            <li key={t.id} className="rounded-xl border border-line/60 bg-panel-2/70 p-3">
              <div className="flex items-center gap-2">
                <input
                  className="input py-1.5 text-xl font-bold"
                  defaultValue={t.name}
                  key={t.name}
                  title="Teamname bearbeiten (leer = automatisch)"
                  onBlur={(e) => e.target.value !== t.name && commit((s) => S.renameTeam(s, t.id, e.target.value), 'Team umbenannt')}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                {t.customName && (
                  <IconBtn title="Automatischen Namen verwenden" onClick={() => commit((s) => S.renameTeam(s, t.id, ''), 'Teamname zurückgesetzt')}>
                    ↺
                  </IconBtn>
                )}
                {!locked && (
                  <IconBtn title="Team auflösen" danger onClick={() => commit((s) => S.removeTeam(s, t.id), 'Team aufgelöst')}>
                    ✕
                  </IconBtn>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {t.playerIds.map((pid) => (
                  <span key={pid} className="inline-flex items-center gap-1 rounded-full bg-bg/70 py-0.5 pl-3 pr-1 text-base">
                    {pname(pid)}
                    {!locked && (
                      <button
                        title="Zurück in den Lostopf"
                        className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-cup/30 hover:text-text"
                        onClick={() => commit((s) => S.removeFromTeam(s, t.id, pid), 'Spieler aus Team entfernt')}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {!locked && (
                  <select
                    className="rounded-full border border-line bg-bg/70 px-2 py-0.5 text-base text-muted"
                    value=""
                    onChange={(e) => e.target.value && commit((s) => S.addToTeam(s, t.id, e.target.value), 'Spieler zu Team hinzugefügt')}
                  >
                    <option value="">+ Spieler</option>
                    {state.players
                      .filter((p) => !t.playerIds.includes(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {state.teams.some((x) => x.playerIds.includes(p.id)) ? ' (wechselt Team)' : ''}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            </li>
          ))}
          {state.teams.length === 0 && (
            <li className="rounded-xl border border-dashed border-line p-5 text-center text-muted">Noch keine Teams. Lose aus oder bilde Teams von Hand.</li>
          )}
        </ul>
      </section>
    </div>
  )
}

/** Auswahl, was mit dem übrig gebliebenen Spieler bei ungerader Anzahl passiert. */
export function OddPlayerChoice({ store, playerId, compact }: { store: Store; playerId: string; compact?: boolean }) {
  const { state, commit } = store
  const name = state.players.find((p) => p.id === playerId)?.name ?? '?'
  const [teamId, setTeamId] = useState('')
  const twoTeams = state.teams.filter((t) => t.playerIds.length === 2)

  const joinTeam = () => {
    const target = teamId || twoTeams[Math.floor(Math.random() * twoTeams.length)]?.id
    if (target) commit((s) => S.addToTeam(s, target, playerId), `${name} ins Dreierteam`)
  }

  return (
    <div className={`rounded-xl border-2 border-lb/60 bg-lb/10 ${compact ? 'p-3' : 'p-6'}`}>
      <p className={`font-bold ${compact ? 'text-base' : 'text-2xl'}`}>
        Ungerade Spielerzahl: <span className="text-lb">{name}</span> ist übrig. Was soll passieren?
      </p>
      <div className={`mt-3 flex flex-wrap gap-2 ${compact ? 'text-sm' : 'text-lg'}`}>
        <button className="btn" onClick={() => commit((s) => S.createTeam(s, [playerId]), `${name} als Einzelteam`)}>
          Allein als eigenes Team
        </button>
        <div className="flex gap-1">
          <select className="rounded-xl border border-line bg-bg px-2" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">zufälliges Team</option>
            {twoTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button className="btn" onClick={joinTeam} disabled={twoTeams.length === 0}>
            Dreierteam
          </button>
        </div>
        <button className="btn" onClick={() => commit((s) => S.togglePaused(s, playerId), `${name} pausiert`)}>
          Pausieren
        </button>
      </div>
    </div>
  )
}
