import { useMemo } from 'react'
import { BYE, type Bracket, type MatchState, describeSource, roundName, structuralByes } from '../lib/bracket'

interface Props {
  bracket: Bracket
  ready: MatchState[]
  waiting: MatchState[]
  champion: string | null
  name: (id: string | null) => string
  onOpen: (id: string) => void
  onShowWinner: () => void
  big?: boolean
}

const sideColor = { W: 'var(--color-wb)', L: 'var(--color-lb)', GF: 'var(--color-beer)' }

export function UpNext({ bracket, ready, waiting, champion, name, onOpen, onShowWinner, big }: Props) {
  const byes = useMemo(() => structuralByes(bracket), [bracket])
  if (champion) {
    return (
      <div className="panel flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="text-[110px] leading-none">🏆</div>
        <div className="font-display mt-4 text-4xl text-muted">Turniersieger</div>
        <div className="font-display mt-2 text-7xl leading-[0.95] text-beer break-words">{name(champion)}</div>
        <button className="btn mt-8 text-lg" onClick={onShowWinner}>
          🎉 Siegerehrung zeigen
        </button>
      </div>
    )
  }

  const list = [...ready.slice(0, 3), ...waiting.slice(0, Math.max(0, 3 - ready.length))]

  return (
    <div className="panel flex h-full flex-col p-5">
      <h2 className={`font-display leading-none text-beer ${big ? 'text-7xl' : 'text-5xl'}`}>Als Nächstes</h2>
      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4">
        {list.length === 0 && <p className="text-xl text-muted">Keine offenen Matches.</p>}
        {list.map((st, i) => {
          const isReady = st.status === 'ready'
          const isNow = isReady && i === 0
          const color = sideColor[st.match.side]
          const nm = (slot: string | null, k: 0 | 1) =>
            slot && slot !== BYE ? name(slot) : describeSource(bracket, st.match.sources[k], byes)
          return (
            <button
              key={st.match.id}
              onClick={() => isReady && onOpen(st.match.id)}
              className={`rounded-2xl border-2 p-4 text-left transition ${
                isNow ? 'pulse-ring border-beer bg-beer/10' : isReady ? 'border-line bg-panel-2 hover:border-beer/60' : 'border-dashed border-line/70 bg-panel-2/40'
              }`}
            >
              <div className="flex items-center justify-between text-[15px] font-bold uppercase tracking-wider">
                <span className={isNow ? 'text-beer' : 'text-muted'}>{isNow ? '● Jetzt dran' : isReady ? 'Danach' : 'Wartet noch'}</span>
                <span style={{ color }}>
                  {st.match.label} · {roundName(bracket, st.match.side, st.match.round)}
                </span>
              </div>
              <div className={`mt-2 font-extrabold leading-tight ${isNow ? 'text-[34px]' : 'text-[26px]'} ${isReady ? '' : 'text-muted'}`}>
                <div className="truncate">{nm(st.a, 0)}</div>
                <div className="my-0.5 text-[17px] font-bold uppercase tracking-widest text-muted">gegen</div>
                <div className="truncate">{nm(st.b, 1)}</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
