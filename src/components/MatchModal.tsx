import { useEffect, useRef, useState } from 'react'
import { type Bracket, type MatchState, type Options, type Results, EXTRA_FINAL_CUPS, GF2, clearResult, roundName, setResult } from '../lib/bracket'
import { Modal, useConfirm } from './Modal'

interface Props {
  st: MatchState | null
  bracket: Bracket
  results: Results
  opts: Options
  name: (id: string | null) => string
  onClose: () => void
  onSave: (results: Results, label: string) => void
}

const cupsFor = (matchId: string) => Array.from({ length: matchId === GF2 ? EXTRA_FINAL_CUPS : 10 }, (_, i) => i + 1)

export function MatchModal({ st, bracket, results, opts, name, onClose, onSave }: Props) {
  const confirm = useConfirm()
  const [winner, setWinner] = useState<string | null>(null)
  const [cups, setCups] = useState<number | undefined>(undefined)
  // verhindert doppeltes Speichern, solange eine Rückfrage offen ist
  const busy = useRef(false)

  useEffect(() => {
    setWinner(st?.result?.winner ?? null)
    setCups(st?.result?.cups)
  }, [st])

  // Tastatur: 1 / 2 wählt Sieger, Enter speichert
  useEffect(() => {
    if (!st) return
    const onKey = (e: KeyboardEvent) => {
      if (busy.current || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === '1') setWinner(st.a)
      if (e.key === '2') setWinner(st.b)
      if (e.key === 'Enter' && winner) {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!st) return <Modal open={false} onClose={onClose}>{null}</Modal>
  const a = st.a as string
  const b = st.b as string
  const labelOf = (id: string) => bracket.matches.find((m) => m.id === id)?.label ?? id

  async function warnIfNeeded(invalidated: string[]) {
    if (invalidated.length === 0) return true
    busy.current = true
    const ok = await confirm({
      title: 'Folgematches zurücksetzen?',
      message: (
        <>
          <p>Durch diese Änderung werden die Ergebnisse folgender Matches ungültig und gelöscht:</p>
          <p className="mt-3 text-2xl font-bold text-beer">{invalidated.map(labelOf).join(', ')}</p>
        </>
      ),
      confirmLabel: 'Ja, zurücksetzen',
      danger: true,
    })
    busy.current = false
    return ok
  }

  async function save() {
    if (!st || !winner) return
    const change = setResult(bracket, results, st.match.id, winner, cups, opts)
    if (!(await warnIfNeeded(change.invalidated))) return
    onSave(change.results, `Ergebnis ${st.match.label}`)
    onClose()
  }

  async function clear() {
    if (!st) return
    const change = clearResult(bracket, results, st.match.id, opts)
    if (!(await warnIfNeeded(change.invalidated))) return
    onSave(change.results, `Ergebnis ${st.match.label} gelöscht`)
    onClose()
  }

  const side = (id: string, key: string) => {
    const selected = winner === id
    return (
      <button
        onClick={() => setWinner(id)}
        className={`flex min-h-36 flex-1 flex-col items-center justify-center gap-2 rounded-2xl border-4 p-6 text-center transition ${
          selected
            ? 'border-win bg-win/15 text-win shadow-[0_0_40px_rgba(94,224,143,0.35)]'
            : 'border-line bg-panel-2 hover:border-beer/70'
        }`}
      >
        <span className="text-4xl font-black leading-tight break-words">{name(id)}</span>
        <span className="text-base font-semibold uppercase tracking-widest text-muted">
          {selected ? '🏆 Sieger' : `Taste ${key}`}
        </span>
      </button>
    )
  }

  return (
    <Modal open onClose={onClose} wide>
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-6xl text-beer">Ergebnis eintragen</h2>
        <span className="text-xl font-bold text-muted">
          {st.match.label} · {roundName(bracket, st.match.side, st.match.round)}
        </span>
      </div>
      {st.match.id === GF2 && (
        <div className="mt-4 rounded-2xl border-2 border-beer bg-beer/10 px-5 py-3 text-2xl font-bold text-beer">
          🍺 Extra-Finale: {EXTRA_FINAL_CUPS} gegen {EXTRA_FINAL_CUPS} Becher
        </div>
      )}
      <p className="mt-2 text-xl text-muted">Wer hat gewonnen?</p>

      <div className="mt-6 flex items-stretch gap-6">
        {side(a, '1')}
        <span className="font-display self-center text-5xl text-muted">vs</span>
        {side(b, '2')}
      </div>

      <div className="mt-8">
        <p className="text-xl text-muted">
          Verbleibende Becher des Siegers <span className="text-base">(optional)</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {cupsFor(st.match.id).map((c) => (
            <button
              key={c}
              onClick={() => setCups(cups === c ? undefined : c)}
              className={`h-16 w-16 rounded-xl border-2 text-3xl font-black transition ${
                cups === c ? 'border-beer bg-beer text-on-gold' : 'border-line bg-panel-2 hover:border-beer/70'
              }`}
            >
              {c}
            </button>
          ))}
          <button
            onClick={() => setCups(undefined)}
            className={`h-16 rounded-xl border-2 px-5 text-xl font-bold ${
              cups === undefined ? 'border-beer text-beer' : 'border-line text-muted'
            }`}
          >
            keine Angabe
          </button>
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between gap-3">
        <div>
          {st.status === 'done' && (
            <button className="btn btn-danger text-lg" onClick={clear}>
              Ergebnis löschen
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <button className="btn text-xl" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary px-8 text-xl" disabled={!winner} onClick={save}>
            Speichern
          </button>
        </div>
      </div>
    </Modal>
  )
}
