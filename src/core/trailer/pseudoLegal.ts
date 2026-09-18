import { Chess, type Square as ChessJsSquare } from 'chess.js';
import { addDelta, ALL_SQUARES } from '../boardUtils';
import type { Color, Move, Piece, PieceType, Square } from '../types';

export function getPseudoLegalMoves(
  square: Square,
  turn: Color,
  chess: Chess,
  getPiece: (sq: Square) => Piece | null,
): Move[] {
  const leadingPiece = getPiece(square);
  if (!leadingPiece || leadingPiece.color !== turn) return [];

  let queryChess = chess;
  if (chess.turn() !== turn) {
    const parts = chess.fen().split(' ');
    parts[1] = turn;
    queryChess = new Chess(parts.join(' '));
  }

  if (leadingPiece.type === 'k') {
    const moves: Move[] = [];
    const rStr = square[1];
    const r = parseInt(rStr, 10);

    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue;
        const target = addDelta(square, df, dr);
        if (!target) continue;
        const occ = getPiece(target);
        if (!occ || occ.color !== leadingPiece.color) {
          moves.push({ from: square, to: target });
        }
      }
    }

    // Рокировка (если есть права и свободные поля)
    if (square === `e${r}`) {
      const movesRaw = queryChess.moves({ square: square as ChessJsSquare, verbose: true });
      for (const m of movesRaw) {
        if (m.flags.includes('k') || m.flags.includes('q')) {
          moves.push({
            from: square,
            to: m.to as Square,
            isCastle: true,
          });
        }
      }
    }
    return moves;
  }

  if (leadingPiece.type === 'r') {
    const moves: Move[] = [];
    const rank = turn === 'w' ? '1' : '8';
    const kingSq = `e${rank}` as Square;
    const kRookSq = `h${rank}` as Square;
    const qRookSq = `a${rank}` as Square;

    if (square === kRookSq || square === qRookSq) {
      const kingMoves = queryChess.moves({ square: kingSq as ChessJsSquare, verbose: true });
      if (square === kRookSq && kingMoves.some((m) => m.flags.includes('k'))) {
        moves.push({ from: square, to: `f${rank}` as Square, isCastle: true });
      } else if (square === qRookSq && kingMoves.some((m) => m.flags.includes('q'))) {
        moves.push({ from: square, to: `d${rank}` as Square, isCastle: true });
      }
    }

    const tempChess = new Chess(queryChess.fen());
    if (kingSq && getPiece(kingSq)?.type === 'k') {
      tempChess.remove(kingSq as ChessJsSquare);
    }
    const raw = tempChess.moves({ square: square as ChessJsSquare, verbose: true });

    for (const m of raw) {
      moves.push({
        from: m.from as Square,
        to: m.to as Square,
        promotion: m.promotion ? (m.promotion as PieceType) : undefined,
        san: m.san,
        isEnPassant: m.flags.includes('e'),
        isCastle: m.flags.includes('k') || m.flags.includes('q'),
      });
    }
    return moves;
  }

  // Для остальных фигур: временно убираем короля активного цвета
  const tempChess = new Chess(queryChess.fen());
  const kingSq = ALL_SQUARES.find((sq) => {
    const p = getPiece(sq);
    return p?.type === 'k' && p.color === turn;
  });

  if (kingSq) {
    tempChess.remove(kingSq as ChessJsSquare);
  }

  const raw = tempChess.moves({ square: square as ChessJsSquare, verbose: true });

  return raw.map((m) => ({
    from: m.from as Square,
    to: m.to as Square,
    promotion: m.promotion ? (m.promotion as PieceType) : undefined,
    san: m.san,
    isEnPassant: m.flags.includes('e'),
    isCastle: m.flags.includes('k') || m.flags.includes('q'),
  }));
}
