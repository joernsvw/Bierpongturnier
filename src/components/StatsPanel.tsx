import type { EntrantStats, EntrantStatus } from '../lib/bracket'
import type { AppState } from '../lib/state'

const STATUS: Record<EntrantStatus, { text: string; cls: string; rank: number }> = {
  champion: { text: '🏆 Turniersieger', cls: 'text-beer', rank: 0 },
  runnerUp: { text: '🥈 Zweiter', cls: 'text-text', rank: 1 },
  gf: { text: 'Grand Final', cls: 'text-beer', rank: 2 },
  wb: { text: 'Winner Bracket', cls: 'text-wb', rank: 3 },
  lb: { text: 'Loser Bracket', cls: 'text-lb', rank: 4 },
  out: { text: 'ausgeschieden', cls: 'text-muted', rank: 5 },
}

interface Row {
  id: string
  name: string
  sub?: string
  s: EntrantStats
}

export function StatsPanel({ state, stats }: { state: AppState; stats: Record<string, EntrantStats> | null }) {
  const t = state.tournament
  if (!t || !stats) {
    return <p className="rounded-xl border border-dashed border-line p-5 text-center text-lg text-muted">Die Tabelle erscheint, sobald das Turnier gestartet ist.</p>
  }
  const pname = (id: string) => state.players.find((p) => p.id === id)?.name ?? '?'

  const sort = (rows: Row[]) =>
    rows.sort(
      (a, b) =>
        STATUS[a.s.status].rank - STATUS[b.s.status].rank ||
        b.s.wins - a.s.wins ||
        a.s.losses - b.s.losses ||
        b.s.cupDiff - a.s.cupDiff ||
        a.name.localeCompare(b.name),
    )

  let entrantRows: Row[]
  let playerRows: Row[] = []
  if (t.mode === 'double') {
    entrantRows = state.teams
      .filter((team) => stats[team.id])
      .map((team) => ({ id: team.id, name: team.name, s: stats[team.id] }))
    playerRows = state.teams.flatMap((team) =>
      stats[team.id] ? team.playerIds.map((pid) => ({ id: pid, name: pname(pid), sub: team.name, s: stats[team.id] })) : [],
    )
  } else {
    entrantRows = state.players.filter((p) => stats[p.id]).map((p) => ({ id: p.id, name: p.name, s: stats[p.id] }))
  }

  return (
    <div className="-mr-2 h-full space-y-6 overflow-y-auto pr-2">
      <Table title={t.mode === 'double' ? 'Teams' : 'Spieler'} rows={sort(entrantRows)} />
      {t.mode === 'double' && <Table title="Spieler" rows={sort(playerRows)} showSub />}
    </div>
  )
}

function Table({ title, rows, showSub }: { title: string; rows: Row[]; showSub?: boolean }) {
  return (
    <section>
      <h3 className="mb-2 text-lg font-bold text-muted">{title}</h3>
      <table className="w-full table-fixed border-separate border-spacing-y-1 text-left">
        <thead>
          <tr className="text-sm uppercase tracking-wider text-muted">
            <th className="pl-3 font-semibold">Name</th>
            <th className="w-10 text-center font-semibold" title="Siege">S</th>
            <th className="w-10 text-center font-semibold" title="Niederlagen">N</th>
            <th className="w-12 text-center font-semibold" title="Becherdifferenz">±</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = STATUS[r.s.status]
            return (
              <tr key={r.id + (r.sub ?? '')} className={`bg-panel-2/70 ${r.s.status === 'out' ? 'opacity-55' : ''}`}>
                <td className="rounded-l-xl py-1.5 pl-3">
                  <div className="truncate text-lg font-bold leading-tight">{r.name}</div>
                  <div className={`truncate text-sm font-semibold ${st.cls}`}>
                    {st.text}
                    {showSub && r.sub ? <span className="text-muted"> · {r.sub}</span> : null}
                  </div>
                </td>
                <td className="text-center text-xl font-bold text-win">{r.s.wins}</td>
                <td className="text-center text-xl font-bold text-cup">{r.s.losses}</td>
                <td className="rounded-r-xl text-center text-xl font-bold">{r.s.cupDiff > 0 ? `+${r.s.cupDiff}` : r.s.cupDiff}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
