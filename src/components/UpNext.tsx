import { BYE, type Bracket, EXTRA_FINAL_CUPS, GF2, type MatchState, describeSource, roundName, structuralByes } from '../lib/bracket'
import { MODE_LABEL, type Mode } from '../lib/state'

/** Ein Match mit Bezug zu seinem Turnier (es können zwei parallel laufen) */
export interface MatchItem {
  mode: Mode
  st: MatchState
  bracket: Bracket
  /** spielbereit, aber ein Spieler steht gerade an einem anderen Tisch */
  blocked?: boolean
}

interface Props {
  /** Index = Tisch - 1; null = Tisch frei */
  tables: (MatchItem | null)[]
  /** spielbereit (ohne Tisch) bzw. demnächst */
  queue: MatchItem[]
  champions: { mode: Mode; name: string }[]
  /** zwei Turniere laufen → Turnier an jedem Match anzeigen */
  showMode: boolean
  name: (id: string | null) => string
  onOpen: (mode: Mode, id: string) => void
  onShowWinner: (mode: Mode) => void
  big?: boolean
}

const sideColor = { W: 'var(--color-wb)', L: 'var(--color-lb)', GF: 'var(--color-beer)' }
const byesCache = new WeakMap<Bracket, Set<string>>()
const byesOf = (b: Bracket) => {
  let s = byesCache.get(b)
  if (!s) byesCache.set(b, (s = structuralByes(b)))
  return s
}

export function UpNext({ tables, queue, champions, showMode, name, onOpen, onShowWinner, big }: Props) {
  const nothingLeft = tables.every((t) => t === null) && queue.length === 0

  if (nothingLeft && champions.length > 0) {
    return (
      <div className="panel flex h-full flex-col items-center justify-center gap-10 p-6 text-center">
        {champions.map((c) => (
          <div key={c.mode}>
            <div className="text-[100px] leading-none">🏆</div>
            <div className="font-display mt-3 text-4xl text-muted">{showMode ? `${MODE_LABEL[c.mode]}-Sieger` : 'Turniersieger'}</div>
            <div className="font-display mt-1 text-6xl leading-[0.95] text-beer break-words">{c.name}</div>
            <button className="btn mt-5 text-lg" onClick={() => onShowWinner(c.mode)}>
              🎉 Siegerehrung zeigen
            </button>
          </div>
        ))}
      </div>
    )
  }

  const nm = (it: MatchItem, k: 0 | 1) => {
    const slot = k === 0 ? it.st.a : it.st.b
    return slot && slot !== BYE ? name(slot) : describeSource(it.bracket, it.st.match.sources[k], byesOf(it.bracket))
  }
  const meta = (it: MatchItem) => (
    <span className="truncate" style={{ color: sideColor[it.st.match.side] }}>
      {showMode && <span className="text-text">{MODE_LABEL[it.mode]} · </span>}
      {it.st.match.side === 'GF'
        ? it.st.match.id === GF2
          ? `Extra-Finale ${EXTRA_FINAL_CUPS}:${EXTRA_FINAL_CUPS}`
          : 'Grand Final'
        : `${it.st.match.label} · ${roundName(it.bracket, it.st.match.side, it.st.match.round)}`}
    </span>
  )
  // Bei mehreren Tischen weniger Platz für die Warteschlange
  const after = queue.slice(0, tables.length >= 3 ? 1 : tables.length === 2 ? 2 : 3)

  return (
    <div className="panel flex h-full flex-col overflow-hidden p-5">
      <h2 className={`font-display leading-none text-beer ${big ? 'text-6xl' : 'text-5xl'}`}>
        {tables.length > 1 ? 'An den Tischen' : 'Jetzt dran'}
      </h2>
      <div className="mt-4 flex flex-col gap-3">
        {tables.map((it, i) =>
          it ? (
            <button
              key={i}
              onClick={() => onOpen(it.mode, it.st.match.id)}
              className="pulse-ring w-full rounded-2xl border-2 border-beer bg-beer/10 p-4 text-left transition hover:bg-beer/15"
            >
              <div className="flex items-center justify-between gap-2 text-[15px] font-bold uppercase tracking-wider">
                <span className="shrink-0 rounded-md bg-beer px-2 py-0.5 text-on-gold">Tisch {i + 1}</span>
                {meta(it)}
              </div>
              <div className={`mt-2 font-extrabold leading-tight ${tables.length > 2 ? 'text-[26px]' : 'text-[32px]'}`}>
                <div className="truncate">{nm(it, 0)}</div>
                <div className="my-0.5 text-[16px] font-bold uppercase tracking-widest text-muted">gegen</div>
                <div className="truncate">{nm(it, 1)}</div>
              </div>
            </button>
          ) : (
            <div key={i} className="rounded-2xl border-2 border-dashed border-line/70 p-4">
              <div className="text-[15px] font-bold uppercase tracking-wider">
                <span className="rounded-md bg-panel-2 px-2 py-0.5 text-muted">Tisch {i + 1}</span>
              </div>
              <div className="mt-2 text-2xl font-bold text-muted">frei</div>
            </div>
          ),
        )}
      </div>

      {after.length > 0 && (
        <>
          <h3 className="font-display mt-6 text-4xl leading-none text-text/90">Als Nächstes</h3>
          <div className="mt-3 flex min-h-0 flex-col gap-3">
            {after.map((it) => {
              const isReady = it.st.status === 'ready'
              const status = !isReady ? 'Wartet noch' : it.blocked ? 'Spieler am Tisch' : 'Bereit'
              return (
                <button
                  key={it.mode + it.st.match.id}
                  onClick={() => isReady && onOpen(it.mode, it.st.match.id)}
                  className={`rounded-2xl border-2 p-3 text-left transition ${
                    isReady ? 'border-line bg-panel-2 hover:border-beer/60' : 'border-dashed border-line/70 bg-panel-2/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[14px] font-bold uppercase tracking-wider">
                    <span className={`shrink-0 ${isReady && !it.blocked ? 'text-beer' : 'text-muted'}`}>{status}</span>
                    {meta(it)}
                  </div>
                  <div className={`mt-1 text-[23px] font-extrabold leading-tight ${isReady ? '' : 'text-muted'}`}>
                    <div className="truncate">{nm(it, 0)}</div>
                    <div className="truncate">
                      <span className="text-[15px] font-bold uppercase tracking-widest text-muted">gegen </span>
                      {nm(it, 1)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {champions.length > 0 && (
        <div className="mt-auto space-y-1 pt-4">
          {champions.map((c) => (
            <button key={c.mode} className="w-full truncate text-left text-xl font-bold text-beer" onClick={() => onShowWinner(c.mode)}>
              🏆 {MODE_LABEL[c.mode]}-Sieger: {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
