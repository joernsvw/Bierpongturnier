import { useState } from 'react'
import * as S from '../lib/state'
import type { Store } from '../lib/useStore'
import { useConfirm } from './Modal'

export function PlayersPanel({ store, locked }: { store: Store; locked: boolean }) {
  const { state, commit } = store
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const add = () => {
    if (!name.trim()) return
    commit((s) => S.addPlayer(s, name), `Spieler „${name.trim()}“ hinzugefügt`)
    setName('')
  }

  const finishEdit = () => {
    if (editing) commit((s) => S.renamePlayer(s, editing, editValue), 'Spieler umbenannt')
    setEditing(null)
  }

  const remove = async (p: S.Player) => {
    const inTeam = state.teams.some((t) => t.playerIds.includes(p.id))
    if (inTeam && !(await confirm({ title: 'Spieler löschen?', message: `${p.name} ist bereits in einem Team und wird daraus entfernt.`, confirmLabel: 'Löschen', danger: true })))
      return
    commit((s) => S.removePlayer(s, p.id), `Spieler „${p.name}“ gelöscht`)
  }

  const teamOf = (id: string) => state.teams.find((t) => t.playerIds.includes(id))

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex rounded-xl border border-line bg-bg/60 p-1">
        {(['single', 'double'] as const).map((m) => (
          <button
            key={m}
            disabled={locked}
            onClick={() => commit((s) => ({ ...s, mode: m }), `Modus ${m === 'single' ? 'Einzel' : 'Doppel'}`)}
            className={`flex-1 rounded-lg py-2.5 text-xl font-bold transition disabled:cursor-not-allowed ${
              state.mode === m ? 'bg-club text-white' : 'text-muted hover:text-text'
            }`}
          >
            {m === 'single' ? 'Einzel' : 'Doppel'}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="input text-xl"
          placeholder="Name eingeben + Enter"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          disabled={locked}
        />
        <button className="btn btn-primary text-xl" onClick={add} disabled={!name.trim()}>
          +
        </button>
      </div>
      {locked && (
        <p className="text-sm text-muted">Turnier läuft: Spieler können nur umbenannt werden.</p>
      )}

      <div className="flex items-center justify-between text-muted">
        <span className="text-lg font-semibold">{state.players.length} Spieler</span>
        {state.mode === 'double' && state.paused.length > 0 && <span>{state.paused.length} pausiert</span>}
      </div>

      <ul className="-mr-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-2">
        {state.players.map((p, i) => {
          const paused = state.paused.includes(p.id)
          const team = teamOf(p.id)
          return (
            <li key={p.id} className="group flex items-center gap-2 rounded-xl border border-line/60 bg-panel-2/70 px-3 py-2">
              <span className="w-7 text-right text-lg font-bold text-muted">{i + 1}</span>
              {editing === p.id ? (
                <input
                  autoFocus
                  className="input py-1 text-xl"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={finishEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishEdit()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <button
                  className={`min-w-0 flex-1 truncate text-left text-xl font-semibold ${paused ? 'text-muted line-through' : ''}`}
                  title="Klicken zum Umbenennen"
                  onClick={() => {
                    setEditing(p.id)
                    setEditValue(p.name)
                  }}
                >
                  {p.name}
                </button>
              )}
              {state.mode === 'double' && team && <span className="text-sm font-bold text-wb" title="Ist in einem Team">✓ Team</span>}
              {state.mode === 'double' && paused && <span className="text-sm font-bold text-lb">Pause</span>}
              {!locked && editing !== p.id && (
                <div className="hidden group-hover:flex">
                  <IconBtn title="Nach oben" onClick={() => commit((s) => S.movePlayer(s, p.id, -1), 'Reihenfolge geändert')}>↑</IconBtn>
                  <IconBtn title="Nach unten" onClick={() => commit((s) => S.movePlayer(s, p.id, 1), 'Reihenfolge geändert')}>↓</IconBtn>
                  {state.mode === 'double' && (
                    <IconBtn
                      title={paused ? 'Wieder mitspielen' : 'Pausieren'}
                      onClick={() => commit((s) => S.togglePaused(s, p.id), paused ? 'Pause aufgehoben' : 'Spieler pausiert')}
                    >
                      {paused ? '▶' : '⏸'}
                    </IconBtn>
                  )}
                  <IconBtn title="Löschen" danger onClick={() => remove(p)}>✕</IconBtn>
                </div>
              )}
            </li>
          )
        })}
        {state.players.length === 0 && (
          <li className="rounded-xl border border-dashed border-line p-6 text-center text-lg text-muted">
            Noch keine Spieler. Namen oben eintippen und Enter drücken.
          </li>
        )}
      </ul>
    </div>
  )
}

export function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-lg text-lg font-bold transition hover:bg-bg ${danger ? 'text-cup' : 'text-muted hover:text-text'}`}
    >
      {children}
    </button>
  )
}
