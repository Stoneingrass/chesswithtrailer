import { getDelta, getPathSquares, ALL_SQUARES } from '../boardUtils';
import type { Color, Piece, Square } from '../types';
import type { TrailerOptions } from './types';

export function pathIsClear(
  from: Square,
  to: Square,
  getPiece: (sq: Square) => Piece | null,
): boolean {
  return getPathSquares(from, to).every((square) => !getPiece(square));
}

export function pieceAttacksSquare(
  from: Square,
  target: Square,
  getPiece: (sq: Square) => Piece | null,
): boolean {
  const piece = getPiece(from);
  if (!piece || from === target) return false;

  const { df, dr } = getDelta(from, target);
  const absFile = Math.abs(df);
  const absRank = Math.abs(dr);

  switch (piece.type) {
    case 'p':
      return absFile === 1 && dr === (piece.color === 'w' ? 1 : -1);
    case 'n':
      return (absFile === 1 && absRank === 2) || (absFile === 2 && absRank === 1);
    case 'k':
      return Math.max(absFile, absRank) === 1;
    case 'b':
      return absFile === absRank && pathIsClear(from, target, getPiece);
    case 'r':
      return (df === 0 || dr === 0) && pathIsClear(from, target, getPiece);
    case 'q':
      return (df === 0 || dr === 0 || absFile === absRank) && pathIsClear(from, target, getPiece);
  }
}

export function getDirectProtectors(
  square: Square,
  color: Color,
  getPiece: (sq: Square) => Piece | null,
): Square[] {
  const protectors: Square[] = [];

  for (const sq of ALL_SQUARES) {
    const piece = getPiece(sq);
    if (!piece || piece.color !== color || sq === square) continue;
    if (pieceAttacksSquare(sq, square, getPiece)) {
      protectors.push(sq);
    }
  }
  return protectors;
}

export function getProtectors(
  square: Square,
  options: TrailerOptions,
  color: Color,
  getPiece: (sq: Square) => Piece | null,
): Square[] {
  const direct = getDirectProtectors(square, color, getPiece);
  if (!options.allowRecursiveGroup || !options.allowMultiFollower) {
    return direct;
  }

  const set = new Set<Square>(direct);
  let changed = true;
  while (changed) {
    changed = false;
    for (const follower of [...set]) {
      for (const protector of getDirectProtectors(follower, color, getPiece)) {
        if (protector !== square && !set.has(protector)) {
          const p = getPiece(protector);
          if (p?.type === 'k' && options.kingCannotBeFollower) continue;
          set.add(protector);
          changed = true;
        }
      }
    }
  }
  return [...set];
}
