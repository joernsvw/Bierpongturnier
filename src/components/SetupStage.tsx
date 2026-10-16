import * as S from '../lib/state'
import type { Draw } from '../lib/useDraw'
import type { Store } from '../lib/useStore'
import { useConfirm } from './Modal'
import { OddPlayerChoice } from './TeamsPanel'
import { Wheel } from './Wheel'

/** Mittlerer Bereich vor dem Turnierstart: Auslosung und Startknopf. */
export function SetupStage({ store, draw }: { store: Store; draw: Draw }) {
  const { state, commit } = store
  const confirm = useConfirm()
  const pool = S.drawPool(state)
  const entrants = S.currentEntrants(state)
  const pname = (id: string) => state.players.find((p) => p.id === id)?.name ?? '?'
  const shown = draw.spin ?? draw.lastSpin
  const wheelItems = shown?.pool ?? pool

  const start = async () => {
    if (entrants.length < 2) return
    if (state.mode === 'double' && pool.length > 0) {
      const ok = await confirm({
        title: 'Nicht alle Spieler verteilt',
        message: `${pool.map((p) => p.name).join(', ')} ${pool.length === 1 ? 'ist' : 'sind'} in keinem Team und spielt nicht mit. Trotzdem starten?`,
        confirmLabel: 'Trotzdem starten',
      })
      if (!ok) return
    }
    const ok = await confirm({
      title: 'Turnier starten?',
      message: (
        <>
          {entrants.length} {state.mode === 'double' ? 'Teams' : 'Spieler'}, Paarungen{' '}
          {state.settings.seeding === 'random' ? 'per Zufall' : 'nach Reihenfolge'}. Danach sind Teilnehmer und Teams gesperrt (Namen bleiben änderbar).
        </>
      ),
      confirmLabel: '🍺 Los geht’s',
    })
    if (ok) commit(S.startTournament, 'Turnier gestartet')
  }

  const activePlayers = state.players.filter((p) => !state.paused.includes(p.id)).length

  return (
    <div className="flex h-full flex-col">
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-8 py-5">
      {state.mode === 'double' ? (
        <>
          <h2 className="font-display text-7xl leading-none text-beer">Team-Auslosung</h2>
          <p className="mt-2 text-xl text-muted">
            {pool.length >= 2
              ? `${pool.length} Spieler im Lostopf`
              : pool.length === 1
                ? 'Ein Spieler ist übrig'
                : state.teams.length > 0
                  ? 'Alle Spieler sind verteilt'
                  : 'Füge links Spieler hinzu'}
            {activePlayers % 2 === 1 && pool.length > 1 && ' · ungerade Anzahl, am Ende bleibt jemand übrig'}
          </p>

          {wheelItems.length >= 2 ? (
            <div className="mt-4 flex items-start justify-center gap-16">
              <Wheel items={wheelItems} target={shown?.targets[0] ?? null} spinKey={shown?.key ?? 0} duration={4200} size={360} onDone={draw.wheelDone} />
              <div className="font-display self-center pt-8 text-8xl text-beer">&amp;</div>
              <Wheel items={wheelItems} target={shown?.targets[1] ?? null} spinKey={shown?.key ?? 0} duration={5200} size={360} paletteOffset={3} onDone={draw.wheelDone} />
            </div>
          ) : null}

          <div className="mt-4 flex min-h-24 items-center">
            {draw.lastTeam ? (
              <div className="pop-in rounded-2xl border-2 border-win bg-win/10 px-10 py-4 text-center">
                <div className="text-lg font-bold uppercase tracking-widest text-win">Neues Team</div>
                <div className="font-display text-6xl leading-tight">{draw.lastTeam.map(pname).join(' & ')}</div>
              </div>
            ) : draw.spinning ? (
              <div className="font-display animate-pulse text-5xl text-muted">Die Räder drehen sich …</div>
            ) : pool.length >= 2 ? (
              <button className="btn btn-primary px-10 py-4 text-3xl" onClick={draw.next}>
                🎡 Nächstes Team losen
              </button>
            ) : null}
          </div>
          {draw.lastTeam && pool.length >= 2 && !draw.spinning && (
            <button className="btn btn-primary mt-4 px-10 py-4 text-3xl" onClick={draw.next}>
              🎡 Nächstes Team losen
            </button>
          )}
          {pool.length === 1 && state.teams.length > 0 && !draw.spinning && (
            <div className="mt-4 max-w-3xl">
              <OddPlayerChoice store={store} playerId={pool[0].id} />
            </div>
          )}
        </>
      ) : (
        <>
          <h2 className="font-display text-7xl leading-none text-beer">Einzel-Turnier</h2>
          <p className="mt-2 text-xl text-muted">Jeder Spieler tritt für sich an.</p>
          <div className="mt-8 flex max-w-5xl flex-wrap justify-center gap-3">
            {state.players.map((p) => (
              <span key={p.id} className="rounded-2xl border-2 border-line bg-panel-2 px-5 py-2 text-3xl font-bold">
                {p.name}
              </span>
            ))}
          </div>
        </>
      )}

    </div>
      <div className="mx-auto w-full max-w-4xl px-8 pb-5 pt-3">
        <div className="panel flex flex-wrap items-center gap-6 p-5">
          <label className="flex items-center gap-3 text-lg">
            <span className="whitespace-nowrap text-muted">Erstrunden-Paarungen</span>
            <select
              className="input w-auto py-2"
              value={state.settings.seeding}
              onChange={(e) => commit((s) => S.updateSettings(s, { seeding: e.target.value as S.Settings['seeding'] }), 'Einstellung geändert')}
            >
              <option value="random">per Zufall</option>
              <option value="order">nach Reihenfolge (Setzliste)</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-lg">
            <input
              type="checkbox"
              className="h-6 w-6 accent-[#0d7e35]"
              checked={state.settings.grandFinalReset}
              onChange={(e) => commit((s) => S.updateSettings(s, { grandFinalReset: e.target.checked }), 'Einstellung geändert')}
            />
            <span>Bracket Reset im Grand Final</span>
          </label>
          <button className="btn btn-primary ml-auto px-8 py-3 text-2xl" disabled={entrants.length < 2 || draw.spinning} onClick={start}>
            Turnier starten ({entrants.length})
          </button>
        </div>
        {state.settings.seeding === 'order' && (
          <p className="mt-2 text-center text-muted">
            Reihenfolge = Setzliste: Platz 1 spielt gegen den letzten Platz, Freilose gehen an die vorderen Plätze.
          </p>
        )}
      </div>
    </div>
  )
}
