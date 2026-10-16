import { useEffect, useRef, useState } from 'react'

// Vereinsfarben: Grün, Weiß, Gold – jeweils mit gut lesbarer Schriftfarbe
const PALETTE = [
  { fill: '#0d7e35', text: '#ffffff' },
  { fill: '#f3faf5', text: '#0a3d1d' },
  { fill: '#f5c242', text: '#1b1500' },
  { fill: '#075a26', text: '#ffffff' },
  { fill: '#5ee08f', text: '#06301a' },
  { fill: '#d6e8dc', text: '#0a3d1d' },
]
const colorAt = (i: number, n: number, offset: number) => {
  let k = (i + offset) % PALETTE.length
  // letztes Segment nicht in derselben Farbe wie das erste
  if (n > 1 && i === n - 1 && k === offset % PALETTE.length) k = (k + 1) % PALETTE.length
  return PALETTE[k]
}

interface Props {
  items: { id: string; name: string }[]
  /** Spieler, auf dem das Rad landen soll */
  target: string | null
  /** ändert sich bei jedem neuen Dreh */
  spinKey: number
  duration: number
  size: number
  paletteOffset?: number
  onDone: () => void
}

export function Wheel({ items, target, spinKey, duration, size, paletteOffset = 0, onDone }: Props) {
  const [rotation, setRotation] = useState(0)
  const [animating, setAnimating] = useState(false)
  const rotationRef = useRef(0)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (!spinKey || !target) return
    const idx = items.findIndex((i) => i.id === target)
    if (idx < 0) return
    const seg = 360 / items.length
    // Zielwinkel: Segmentmitte (mit etwas Zufall) unter den Zeiger oben
    const jitter = (Math.random() - 0.5) * seg * 0.6
    const center = (idx + 0.5) * seg + jitter
    const base = rotationRef.current
    const wanted = ((-center - base) % 360 + 360) % 360
    const next = base + 360 * 6 + wanted
    rotationRef.current = next
    setAnimating(true)
    setRotation(next)
    const t = setTimeout(() => {
      setAnimating(false)
      doneRef.current()
    }, duration + 50)
    return () => clearTimeout(t)
  }, [spinKey])

  const r = size / 2
  const n = Math.max(items.length, 1)
  const seg = 360 / n
  const fontSize = Math.max(14, Math.min(34, (size / 2) * 0.85 * Math.sin(((seg / 2) * Math.PI) / 180) * 0.9, 300 / Math.max(6, longest(items))))

  return (
    <div className="relative" style={{ width: size, height: size + 30 }}>
      {/* Zeiger */}
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2">
        <svg width="56" height="56" viewBox="0 0 56 56">
          <path d="M28 54 L8 10 Q28 -2 48 10 Z" fill="#fff" stroke="#03130a" strokeWidth="4" />
        </svg>
      </div>
      <div className="absolute left-0 top-[30px] rounded-full shadow-[0_0_60px_rgba(13,126,53,0.45)]" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`${-r} ${-r} ${size} ${size}`}
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: animating ? `transform ${duration}ms cubic-bezier(0.12, 0.75, 0.15, 1)` : 'none',
          }}
        >
          <circle r={r - 2} fill="#08241a" stroke="#f5c242" strokeWidth="6" />
          {items.length === 1 && <circle r={r - 8} fill={PALETTE[paletteOffset % PALETTE.length].fill} />}
          {items.length > 1 &&
            items.map((item, i) => {
              const a0 = ((i * seg - 90) * Math.PI) / 180
              const a1 = (((i + 1) * seg - 90) * Math.PI) / 180
              const rr = r - 8
              const large = seg > 180 ? 1 : 0
              const d = `M0,0 L${rr * Math.cos(a0)},${rr * Math.sin(a0)} A${rr},${rr} 0 ${large} 1 ${rr * Math.cos(a1)},${rr * Math.sin(a1)} Z`
              return <path key={item.id} d={d} fill={colorAt(i, items.length, paletteOffset).fill} stroke="#03130a" strokeWidth="3" />
            })}
          {items.map((item, i) => {
            const mid = i * seg + seg / 2
            return (
              <g key={item.id} transform={`rotate(${mid - 90})`}>
                <text
                  x={r - 26}
                  y={0}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={fontSize}
                  fontWeight={800}
                  fill={colorAt(i, items.length, paletteOffset).text}
                  style={{ fontFamily: 'Inter, Segoe UI, sans-serif' }}
                >
                  {truncate(item.name, 14)}
                </text>
              </g>
            )
          })}
          <circle r={r * 0.13} fill="#03130a" stroke="#f5c242" strokeWidth="5" />
          <text textAnchor="middle" dominantBaseline="central" fontSize={r * 0.12}>
            🍺
          </text>
        </svg>
      </div>
    </div>
  )
}

const longest = (items: { name: string }[]) => Math.max(0, ...items.map((i) => Math.min(14, i.name.length)))
const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + '…' : s)
