import { type Bracket, type Match, type Side, GF1, GF2, roundName } from './bracket'

export const MATCH_W = 290
export const MATCH_H = 116
export const MATCH_HEAD = 28
export const MATCH_ROW = 44
const COL_GAP = 56
const ROW_GAP = 22
const HEADER_H = 56
const SECTION_GAP = 90

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
 * Grand Final rechts. WB-Runde r steht über der LB-Runde, in die ihre
 * Verlierer fallen, damit der Baum kompakt bleibt.
 */
export function layoutBracket(bracket: Bracket, hidden: Set<string>): BracketLayout {
  const pos: Record<string, Box> = {}
  const step = MATCH_W + COL_GAP
  const byRound = (side: Side, round: number) =>
    bracket.matches.filter((m) => m.side === side && m.round === round).sort((a, b) => a.index - b.index)
  const center = (ids: string[]) => {
    const ys = ids.map((id) => pos[id].y)
    return (Math.min(...ys) + Math.max(...ys)) / 2
  }
  const feeders = (m: Match) => m.sources.flatMap((s) => (s.type === 'winner' ? [s.match] : []))

  const wbCol = (r: number) => (bracket.lbRounds === 0 || r === 1 ? 0 : 2 * r - 3)
  const lbCol = (r: number) => r - 1

  // Winner Bracket
  const wbTop = HEADER_H + 46
  for (let r = 1; r <= bracket.wbRounds; r++) {
    for (const m of byRound('W', r)) {
      const y = r === 1 ? wbTop + m.index * (MATCH_H + ROW_GAP) : center(feeders(m))
      pos[m.id] = { x: wbCol(r) * step, y }
    }
  }
  const wbBottom = Math.max(...bracket.matches.filter((m) => m.side === 'W').map((m) => pos[m.id].y)) + MATCH_H

  // Loser Bracket
  const lbTop = wbBottom + SECTION_GAP + HEADER_H + 46
  for (let r = 1; r <= bracket.lbRounds; r++) {
    for (const m of byRound('L', r)) {
      let y: number
      if (r === 1) y = lbTop + m.index * (MATCH_H + ROW_GAP)
      else {
        const f = feeders(m)
        y = center(f)
      }
      pos[m.id] = { x: lbCol(r) * step, y }
    }
  }

  const visibleIds = bracket.matches.filter((m) => !hidden.has(m.id)).map((m) => m.id)

  const lastCol = Math.max(wbCol(bracket.wbRounds), bracket.lbRounds > 0 ? lbCol(bracket.lbRounds) : 0)
  const wbFinal = `W${bracket.wbRounds}-0`
  const lbFinal = bracket.lbRounds > 0 ? `L${bracket.lbRounds}-0` : wbFinal
  const gfY = bracket.lbRounds > 0 ? (pos[wbFinal].y + pos[lbFinal].y) / 2 : pos[wbFinal].y
  pos[GF1] = { x: (lastCol + 1) * step + 40, y: gfY }
  pos[GF2] = { x: (lastCol + 2) * step + 40, y: gfY }

  // Spalten ohne sichtbare Matches (nur Freilose) entfernen
  const usedX = [...new Set(visibleIds.map((id) => pos[id].x))].sort((a, b) => a - b)
  const remap = new Map(usedX.map((x, i) => [x, i * step + (x >= pos[GF1].x ? 40 : 0)]))
  for (const id of Object.keys(pos)) pos[id] = { ...pos[id], x: remap.get(pos[id].x) ?? pos[id].x }

  const headers: ColumnHeader[] = []
  const visibleRound = (side: Side, r: number) => byRound(side, r).find((m) => !hidden.has(m.id))
  for (let r = 1; r <= bracket.wbRounds; r++) {
    const m = visibleRound('W', r)
    if (m) headers.push({ x: pos[m.id].x, y: HEADER_H, text: roundName(bracket, 'W', r), side: 'W' })
  }
  for (let r = 1; r <= bracket.lbRounds; r++) {
    const m = visibleRound('L', r)
    if (m) headers.push({ x: pos[m.id].x, y: lbTop - 46, text: roundName(bracket, 'L', r), side: 'L' })
  }
  headers.push({ x: pos[GF1].x, y: gfY - 46, text: 'Grand Final', side: 'GF' })
  if (!hidden.has(GF2)) headers.push({ x: pos[GF2].x, y: gfY - 46, text: 'Bracket Reset', side: 'GF' })

  const sections = [{ side: 'W' as Side, y: 0, title: 'Winner Bracket' }]
  if (bracket.lbRounds > 0) sections.push({ side: 'L', y: lbTop - 46 - HEADER_H, title: 'Loser Bracket' })

  const width = Math.max(...visibleIds.map((id) => pos[id].x)) + MATCH_W + 20
  const height = Math.max(...visibleIds.map((id) => pos[id].y)) + MATCH_H + 20
  return { pos, headers, sections, width, height }
}
