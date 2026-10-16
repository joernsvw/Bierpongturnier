import { type Bracket, type Match, type Side, EXTRA_FINAL_CUPS, GF1, GF2, effectiveSource, roundName } from './bracket'

export const MATCH_W = 250
export const MATCH_H = 112
export const MATCH_HEAD = 24
export const MATCH_ROW = 44
const COL_GAP = 34
const ROW_GAP = 14
/** Abschnittstitel „Winner Bracket“ / „Loser Bracket“ */
const TITLE_H = 48
/** Rundenüberschrift über den Spalten */
const HEADER_H = 32
const SECTION_GAP = 40
/** Abstand Grand Final → Extra-Finale (darunter) */
const FINAL_GAP = 56

export interface Box {
  x: number
  y: number
}

export interface ColumnHeader {
  x: number
  y: number
  text: string
  side: Side
}

export interface BracketLayout {
  pos: Record<string, Box>
  headers: ColumnHeader[]
  sections: { side: Side; y: number; title: string }[]
  width: number
  height: number
}

/**
 * Berechnet Positionen: Winner Bracket oben, Loser Bracket darunter,
 * Grand Final rechts, Extra-Finale darunter. WB-Runde r steht über der
 * LB-Runde, in die ihre Verlierer fallen. Ausgeblendete Freilos-Matches
 * belegen weder Zeilen noch Spalten, damit der Baum möglichst groß wird.
 */
export function layoutBracket(bracket: Bracket, hidden: Set<string>): BracketLayout {
  const pos: Record<string, Box> = {}
  const byId = new Map(bracket.matches.map((m) => [m.id, m]))
  const step = MATCH_W + COL_GAP
  const rowStep = MATCH_H + ROW_GAP

  const wbCol = (r: number) => (bracket.lbRounds === 0 || r === 1 ? 0 : 2 * r - 3)
  const lbCol = (r: number) => r - 1
  const colOf = (m: Match) => (m.side === 'W' ? wbCol(m.round) : lbCol(m.round))

  /** Sichtbare Vorgänger-Matches derselben Seite (durch Freilose hindurch) */
  const kids = (m: Match): Match[] =>
    m.sources.flatMap((s) => {
      const src = effectiveSource(bracket, s, hidden)
      if (src.type !== 'winner') return []
      const k = byId.get(src.match)!
      return k.side === m.side && !hidden.has(k.id) ? [k] : []
    })

  /** Baum von der Wurzel aus legen: Blätter bekommen fortlaufende Zeilen */
  const placeTree = (root: Match, top: number) => {
    let slot = 0
    const place = (m: Match): number => {
      const ys = kids(m).map(place)
      const y = ys.length === 0 ? top + slot++ * rowStep : (Math.min(...ys) + Math.max(...ys)) / 2
      pos[m.id] = { x: colOf(m) * step, y }
      return y
    }
    place(root)
    return top + Math.max(1, slot) * rowStep - ROW_GAP
  }

  const wbFinal = byId.get(`W${bracket.wbRounds}-0`)!
  const wbTop = TITLE_H + HEADER_H
  const wbBottom = placeTree(wbFinal, wbTop)

  let lbTop = wbBottom
  let lbFinal: Match | null = null
  if (bracket.lbRounds > 0) {
    lbFinal = byId.get(`L${bracket.lbRounds}-0`)!
    lbTop = wbBottom + SECTION_GAP + TITLE_H + HEADER_H
    placeTree(lbFinal, lbTop)
  }

  // Spalten ohne sichtbare Matches entfernen, dann Finale rechts anhängen
  const visibleIds = bracket.matches.filter((m) => !hidden.has(m.id) && m.side !== 'GF' && pos[m.id]).map((m) => m.id)
  const usedX = [...new Set(visibleIds.map((id) => pos[id].x))].sort((a, b) => a - b)
  const remap = new Map(usedX.map((x, i) => [x, i * step]))
  for (const id of visibleIds) pos[id] = { ...pos[id], x: remap.get(pos[id].x)! }

  const gfX = usedX.length * step + 24
  const gfY = lbFinal ? (pos[wbFinal.id].y + pos[lbFinal.id].y) / 2 : pos[wbFinal.id].y
  pos[GF1] = { x: gfX, y: gfY }
  pos[GF2] = { x: gfX, y: gfY + MATCH_H + FINAL_GAP }

  const headers: ColumnHeader[] = []
  const seen = new Set<string>()
  for (const m of bracket.matches) {
    if (m.side === 'GF' || hidden.has(m.id) || !pos[m.id]) continue
    const key = `${m.side}${m.round}`
    if (seen.has(key)) continue
    seen.add(key)
    headers.push({ x: pos[m.id].x, y: (m.side === 'W' ? wbTop : lbTop) - HEADER_H, text: roundName(bracket, m.side, m.round), side: m.side })
  }
  headers.push({ x: gfX, y: gfY - HEADER_H, text: 'Grand Final', side: 'GF' })
  if (!hidden.has(GF2)) headers.push({ x: gfX, y: pos[GF2].y - HEADER_H, text: `Extra-Finale · ${EXTRA_FINAL_CUPS} Cups`, side: 'GF' })

  const sections = [{ side: 'W' as Side, y: 0, title: 'Winner Bracket' }]
  if (lbFinal) sections.push({ side: 'L', y: lbTop - HEADER_H - TITLE_H, title: 'Loser Bracket' })

  const shown = [...visibleIds, GF1, ...(hidden.has(GF2) ? [] : [GF2])]
  const width = Math.max(...shown.map((id) => pos[id].x)) + MATCH_W + 8
  const height = Math.max(...shown.map((id) => pos[id].y)) + MATCH_H + 8
  return { pos, headers, sections, width, height }
}
