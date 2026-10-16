import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BYE,
  type Bracket,
  type MatchState,
  type Slot,
  type TournamentState,
  GF2,
  describeSource,
  effectiveSource,
  structuralByes,
} from '../lib/bracket'
import { MATCH_H, MATCH_HEAD, MATCH_ROW, MATCH_W, layoutBracket } from '../lib/layout'

interface Props {
  bracket: Bracket
  state: TournamentState
  name: (id: string | null) => string
  onOpen: (matchId: string) => void
  /** Match-ID → Tischnummer (1-basiert) */
  tableOf: Map<string, number>
  nextIds: Set<string>
  highlightPath: Set<string>
  /** wechselt, wenn neu eingepasst werden soll (z. B. Präsentationsmodus) */
  fitKey: string
  showReset: boolean
  controls: boolean
}

const sideColor = { W: 'var(--color-wb)', L: 'var(--color-lb)', GF: 'var(--color-beer)' }

export function BracketView({ bracket, state, name, onOpen, tableOf, nextIds, highlightPath, fitKey, showReset, controls }: Props) {
  // Freilos-Matches werden nie gespielt und deshalb nicht gezeigt
  const byes = useMemo(() => structuralByes(bracket), [bracket])
  const hidden = useMemo(() => {
    const h = new Set(byes)
    if (!showReset) h.add(GF2)
    return h
  }, [byes, showReset])

  const layout = useMemo(() => layoutBracket(bracket, hidden), [bracket, hidden])

  // --- Zoom & Pan -----------------------------------------------------------
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)

  const fit = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const pad = 24
    const w = el.clientWidth - pad * 2
    const h = el.clientHeight - pad * 2
    const scale = Math.min(1.25, w / layout.width, h / layout.height)
    setView({
      scale,
      x: pad + (w - layout.width * scale) / 2,
      y: pad + Math.max(0, (h - layout.height * scale) / 2),
    })
  }, [layout.width, layout.height])

  useLayoutEffect(() => fit(), [fit, fitKey])
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  const zoomAt = (factor: number, cx: number, cy: number) =>
    setView((v) => {
      const scale = Math.min(3, Math.max(0.15, v.scale * factor))
      const k = scale / v.scale
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
    })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    if (!d.moved) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    d.moved = true
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }
  const onPointerUp = () => {
    // kurz verzögert zurücksetzen, damit der Klick nach dem Ziehen ignoriert wird
    setTimeout(() => (drag.current = null), 0)
  }
  const handleOpen = (id: string) => {
    if (drag.current?.moved) return
    onOpen(id)
  }

  // --- Verbindungslinien ----------------------------------------------------
  const lines = useMemo(() => {
    const out: { d: string; hot: boolean; color: string }[] = []
    for (const m of bracket.matches) {
      if (hidden.has(m.id)) continue
      m.sources.forEach((src, slot) => {
        src = effectiveSource(bracket, src, byes)
        if (src.type !== 'winner' || hidden.has(src.match)) return
        const from = layout.pos[src.match]
        const to = layout.pos[m.id]
        const srcMatch = state.byId[src.match]
        const x1 = from.x + MATCH_W
        const y1 = from.y + MATCH_H / 2
        const x2 = to.x
        const y2 = to.y + (m.id === GF2 ? MATCH_H / 2 : MATCH_HEAD + MATCH_ROW / 2 + slot * MATCH_ROW)
        const mx = x1 + Math.max(24, (x2 - x1) / 2)
        const hot = highlightPath.has(src.match) && highlightPath.has(m.id)
        out.push({
          d: `M${x1},${y1} H${mx} V${y2} H${x2}`,
          hot,
          color: srcMatch.status === 'done' || srcMatch.status === 'bye' ? sideColor[srcMatch.match.side] : 'var(--color-line)',
        })
      })
    }
    return out
  }, [bracket, layout, state, hidden, byes, highlightPath])

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <div
        ref={wrapRef}
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          {layout.sections.map((s) => (
            <div
              key={s.side}
              className="font-display absolute left-0 text-[44px] leading-none"
              style={{ top: s.y, color: sideColor[s.side] }}
            >
              {s.title}
            </div>
          ))}
          {layout.headers
            .map((h) => (
              <div
                key={h.text + h.x + h.y}
                className="absolute text-center text-[17px] font-bold uppercase tracking-wider text-muted"
                style={{ left: h.x, top: h.y, width: MATCH_W }}
              >
                {h.text}
              </div>
            ))}

          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={layout.width} height={layout.height}>
            {lines.map((l, i) => (
              <path
                key={i}
                d={l.d}
                fill="none"
                stroke={l.hot ? 'var(--color-beer)' : l.color}
                strokeOpacity={l.hot ? 1 : 0.55}
                strokeWidth={l.hot ? 5 : 3}
                strokeLinejoin="round"
              />
            ))}
          </svg>

          {state.list.map((st) =>
            hidden.has(st.match.id) ? null : (
              <MatchCard
                key={st.match.id}
                st={st}
                bracket={bracket}
                byes={byes}
                name={name}
                x={layout.pos[st.match.id].x}
                y={layout.pos[st.match.id].y}
                table={tableOf.get(st.match.id)}
                isNext={nextIds.has(st.match.id)}
                onPath={highlightPath.has(st.match.id)}
                onOpen={handleOpen}
              />
            ),
          )}
        </div>
      </div>

      <div className={`absolute bottom-4 right-4 flex gap-2 ${controls ? '' : 'hidden'}`}>
        <button className="btn h-12 w-12 text-2xl" title="Verkleinern" onClick={() => zoomCenter(0.8)}>
          −
        </button>
        <button className="btn h-12 w-12 text-2xl" title="Vergrößern" onClick={() => zoomCenter(1.25)}>
          +
        </button>
        <button className="btn h-12 text-lg" onClick={fit}>
          ⤢ Alles einpassen
        </button>
      </div>
    </div>
  )

  function zoomCenter(f: number) {
    const el = wrapRef.current
    if (el) zoomAt(f, el.clientWidth / 2, el.clientHeight / 2)
  }
}

function MatchCard({
  st,
  bracket,
  byes,
  name,
  x,
  y,
  table,
  isNext,
  onPath,
  onOpen,
}: {
  st: MatchState
  bracket: Bracket
  byes: Set<string>
  name: (id: string | null) => string
  x: number
  y: number
  table: number | undefined
  isNext: boolean
  onPath: boolean
  onOpen: (id: string) => void
}) {
  const { match, status } = st
  const isNow = table !== undefined
  const color = sideColor[match.side]
  const clickable = status === 'ready' || status === 'done'
  const dim = status === 'bye' || status === 'skipped'

  const row = (slot: Slot, i: 0 | 1) => {
    const isWinner = status === 'done' && st.winner === slot
    const isLoser = status === 'done' && st.loser === slot
    let label: string
    let muted = false
    if (slot === BYE) {
      label = 'Freilos'
      muted = true
    } else if (slot === null) {
      label = describeSource(bracket, match.sources[i], byes) || '–'
      muted = true
    } else label = name(slot)
    return (
      <div
        style={{ height: MATCH_ROW }}
        className={`flex items-center gap-2 px-3 ${i === 0 ? 'border-b border-line/60' : ''} ${
          isWinner ? 'bg-win/15' : ''
        }`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${
            muted
              ? 'text-[19px] italic text-muted/80'
              : isLoser
                ? 'text-[25px] font-semibold text-muted line-through decoration-2'
                : 'text-[26px] font-bold text-text'
          } ${isWinner ? 'text-win' : ''}`}
        >
          {label}
        </span>
        {isWinner && (
          <span className="rounded-md bg-win px-2 text-[20px] font-black text-[#03200f]">
            {st.result?.cups !== undefined ? `+${st.result.cups}` : '✓'}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      onClick={() => clickable && onOpen(match.id)}
      className={`absolute overflow-hidden rounded-xl border-2 bg-panel transition ${
        clickable ? 'cursor-pointer hover:-translate-y-0.5 hover:brightness-125' : ''
      } ${dim ? 'opacity-40' : ''} ${isNow ? 'pulse-ring z-10' : ''}`}
      style={{
        left: x,
        top: y,
        width: MATCH_W,
        height: MATCH_H,
        borderColor: onPath ? 'var(--color-beer)' : isNow || isNext ? 'var(--color-beer)' : status === 'done' ? color : 'var(--color-line)',
        borderStyle: status === 'waiting' ? 'dashed' : 'solid',
      }}
    >
      <div className="flex items-center justify-between px-3 text-[15px] font-bold uppercase tracking-wider" style={{ height: MATCH_HEAD, background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
        <span style={{ color }}>{match.label}</span>
        <span className={isNow ? 'text-beer' : isNext ? 'text-beer/80' : 'text-muted'}>
          {isNow ? `● Tisch ${table}` : isNext ? 'Als Nächstes' : status === 'done' ? 'Fertig' : status === 'bye' ? 'Freilos' : status === 'skipped' ? 'nicht nötig' : ''}
        </span>
      </div>
      {row(st.a, 0)}
      {row(st.b, 1)}
    </div>
  )
}
