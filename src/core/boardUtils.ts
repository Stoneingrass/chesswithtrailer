import type { Square } from './types';

const FILES = 'abcdefgh';

export function parseSquare(sq: Square): { file: number; rank: number } {
  return { file: sq.charCodeAt(0) - 97, rank: parseInt(sq[1], 10) - 1 };
}

export function toSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${rank + 1}` as Square;
}

export function addDelta(sq: Square, df: number, dr: number): Square | null {
  const { file, rank } = parseSquare(sq);
  return toSquare(file + df, rank + dr);
}

export function getDelta(from: Square, to: Square): { df: number; dr: number } {
  const a = parseSquare(from);
  const b = parseSquare(to);
  return { df: b.file - a.file, dr: b.rank - a.rank };
}

/** Клетки на прямой между from и to (не включая концы). Пусто для коня и соседних клеток. */
export function getPathSquares(from: Square, to: Square): Square[] {
  const { df, dr } = getDelta(from, to);
  const steps = Math.max(Math.abs(df), Math.abs(dr));
  if (steps <= 1) return [];
  if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return [];

  const stepFile = df === 0 ? 0 : df / Math.abs(df);
  const stepRank = dr === 0 ? 0 : dr / Math.abs(dr);
  const path: Square[] = [];

  for (let i = 1; i < steps; i++) {
    const sq = addDelta(from, stepFile * i, stepRank * i);
    if (sq) path.push(sq);
  }
  return path;
}

export const ALL_SQUARES: Square[] = [];
for (let rank = 1; rank <= 8; rank++) {
  for (const file of FILES) {
    ALL_SQUARES.push(`${file}${rank}` as Square);
  }
}
