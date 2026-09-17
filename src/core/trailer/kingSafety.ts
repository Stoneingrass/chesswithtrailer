import { Chess, type Square as ChessJsSquare } from 'chess.js';
import { ALL_SQUARES } from '../boardUtils';
import type { Color, Piece, PieceType, Square } from '../types';
import type { PlannedFollower } from './types';
import { applyFullMove } from './applyTrailerMove';

export function isKingAttacked(
  color: Color,
  chess: Chess,
  getPiece: (sq: Square) => Piece | null,
): boolean {
  const kingSquare = ALL_SQUARES.find((square) => {
    const piece = getPiece(square);
    return piece?.type === 'k' && piece.color === color;
  });
  if (!kingSquare) return true;
  const attacker = color === 'w' ? 'b' : 'w';
  return chess.isAttacked(kingSquare as ChessJsSquare, attacker);
}

export function isTrailerMoveKingSafe(
  from: Square,
  to: Square,
  promotion: PieceType | undefined,
  followers: PlannedFollower[],
  chess: Chess,
  getPiece: (sq: Square) => Piece | null,
): boolean {
  const leadingPiece = getPiece(from);
  if (!leadingPiece) return false;
  const fenBeforeMove = chess.fen();
  const tempChess = new Chess(fenBeforeMove);
  try {
    applyFullMove(from, to, promotion, followers, leadingPiece, tempChess, (sq) => {
      const p = tempChess.get(sq as ChessJsSquare);
      return p ? { type: p.type as PieceType, color: p.color as Color } : null;
    });
    return !isKingAttacked(leadingPiece.color, tempChess, (sq) => {
      const p = tempChess.get(sq as ChessJsSquare);
      return p ? { type: p.type as PieceType, color: p.color as Color } : null;
    });
  } catch {
    return false;
  }
}
