import confetti from 'canvas-confetti'
import { useEffect, useRef } from 'react'

export function WinnerOverlay({ name, members, onClose }: { name: string; members?: string; onClose: () => void }) {
  // Ref statt Abhängigkeit, damit das Konfetti nicht bei jedem Render neu startet
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const colors = ['#0d7e35', '#4cd17f', '#ffffff', '#f5c242']
    const end = Date.now() + 3500
    let raf = 0
    const frame = () => {
      confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors, zIndex: 100 })
      confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors, zIndex: 100 })
      if (Date.now() < end) raf = requestAnimationFrame(frame)
    }
    confetti({ particleCount: 180, spread: 100, startVelocity: 55, origin: { y: 0.55 }, colors, zIndex: 100 })
    frame()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      closeRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-40 flex cursor-pointer flex-col items-center justify-center bg-[#021008]/90 fade-in" onClick={onClose}>
      <div className="pop-in text-center">
        <div className="text-[200px] leading-none drop-shadow-[0_0_60px_rgba(245,194,66,0.6)]">🏆</div>
        <div className="font-display mt-6 text-6xl text-muted">Turniersieger</div>
        <div className="font-display mt-4 px-10 text-[150px] leading-[0.9] text-beer drop-shadow-[0_0_40px_rgba(245,194,66,0.45)]">
          {name}
        </div>
        {members && <div className="mt-6 text-4xl font-bold text-text/80">{members}</div>}
        <div className="mt-12 text-xl text-muted">Klicken oder Esc zum Schließen</div>
      </div>
    </div>
  )
}
