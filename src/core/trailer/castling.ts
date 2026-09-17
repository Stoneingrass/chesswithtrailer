import type { Chess, Square as ChessJsSquare } from 'chess.js';
import { getDelta } from '../boardUtils';
import type { Piece, Square } from '../types';

export interface CastlingDetails {
  kingFrom: Square;
  kingTo: Square;
  rookFrom: Square;
  rookTo: Square;
  deltaKing: { df: number; dr: number };
  deltaRook: { df: number; dr: number };
}

export function getCastlingAssociatedSquares(
  square: Square,
  chess: Chess,
  getPiece: (sq: Square) => Piece | null,
): Square[] {
  const piece = getPiece(square);
  if (!piece) return [];
  const turn = piece.color;
  const rank = turn === 'w' ? '1' : '8';
  const kingSq = `e${rank}` as Square;
  const kRookSq = `h${rank}` as Square;
  const qRookSq = `a${rank}` as Square;

  const kingPiece = getPiece(kingSq);
  if (!kingPiece || kingPiece.type !== 'k' || kingPiece.color !== turn) return [];

  const kingMoves = chess.moves({ square: kingSq as ChessJsSquare, verbose: true });
  const hasKingside = kingMoves.some((m) => m.flags.includes('k'));
  const hasQueenside = kingMoves.some((m) => m.flags.includes('q'));

  const associated: Square[] = [];
  if (square === kingSq) {
    if (hasKingside && getPiece(kRookSq)?.type === 'r') associated.push(kRookSq);
    if (hasQueenside && getPiece(qRookSq)?.type === 'r') associated.push(qRookSq);
  } else if (square === kRookSq && hasKingside) {
    associated.push(kingSq);
  } else if (square === qRookSq && hasQueenside) {
    associated.push(kingSq);
  }
  return associated;
}

export function getCastlingDetails(
  from: Square,
  to: Square,
  piece: Piece | undefined,
  getPiece: (sq: Square) => Piece | null,
): CastlingDetails | null {
  const p = piece ?? getPiece(from);
  if (!p) return null;
  const turn = p.color;
  const rank = turn === 'w' ? '1' : '8';
  const kingSq = `e${rank}` as Square;
  const kRookSq = `h${rank}` as Square;
  const qRookSq = `a${rank}` as Square;

  let isKingside = false;
  let isQueenside = false;

  if (p.type === 'k' && from === kingSq) {
    if (to === `g${rank}`) isKingside = true;
    if (to === `c${rank}`) isQueenside = true;
  } else if (p.type === 'r') {
    if (from === kRookSq && to === `f${rank}`) isKingside = true;
    if (from === qRookSq && to === `d${rank}`) isQueenside = true;
  }

  if (!isKingside && !isQueenside) return null;

  const kingFrom = kingSq;
  const kingTo = (isKingside ? `g${rank}` : `c${rank}`) as Square;
  const rookFrom = (isKingside ? kRookSq : qRookSq) as Square;
  const rookTo = (isKingside ? `f${rank}` : `d${rank}`) as Square;

  return {
    kingFrom,
    kingTo,
    rookFrom,
    rookTo,
    deltaKing: getDelta(kingFrom, kingTo),
    deltaRook: getDelta(rookFrom, rookTo),
  };
}
