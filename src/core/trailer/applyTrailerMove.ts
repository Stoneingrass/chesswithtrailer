import { Chess, type Square as ChessJsSquare } from 'chess.js';
import { getDelta } from '../boardUtils';
import type { Move, Piece, PieceType, Square } from '../types';
import type { PlannedFollower } from './types';
import { getCastlingDetails } from './castling';

export function applyFollowerShifts(planned: PlannedFollower[], chess: Chess): void {
  for (const { from } of planned) {
    chess.remove(from as ChessJsSquare);
  }

  for (const { to, piece, promotion } of planned) {
    if (to === null) continue;

    const occupant = chess.get(to as ChessJsSquare);
    if (occupant) {
      chess.remove(to as ChessJsSquare);
    }

    const finalType = piece.type === 'p' && promotion ? promotion : piece.type;

    chess.put(
      { type: finalType as PieceType, color: piece.color },
      to as ChessJsSquare,
    );
  }
}

export function applyFullMove(
  from: Square,
  to: Square,
  promotion: PieceType | undefined,
  followers: PlannedFollower[],
  leadingPiece: Piece,
  chess: Chess,
  getPiece: (sq: Square) => Piece | null,
): void {
  const castleDetails = getCastlingDetails(from, to, leadingPiece, getPiece);
  if (castleDetails) {
    chess.remove(castleDetails.kingFrom as ChessJsSquare);
    chess.remove(castleDetails.rookFrom as ChessJsSquare);
    chess.put({ type: 'k', color: leadingPiece.color }, castleDetails.kingTo as ChessJsSquare);
    chess.put({ type: 'r', color: leadingPiece.color }, castleDetails.rookTo as ChessJsSquare);
    applyFollowerShifts(followers, chess);
    return;
  }

  chess.remove(from as ChessJsSquare);

  if (leadingPiece.type === 'p' && from[0] !== to[0] && !getPiece(to)) {
    const epCapturedSq = `${to[0]}${from[1]}` as Square;
    chess.remove(epCapturedSq as ChessJsSquare);
  }

  const leadingType = leadingPiece.type === 'p' && promotion ? promotion : leadingPiece.type;

  chess.put(
    { type: leadingType, color: leadingPiece.color },
    to as ChessJsSquare,
  );

  applyFollowerShifts(followers, chess);
}

export function generateSanForMove(
  from: Square,
  to: Square,
  promotion: PieceType | undefined,
  leadingPiece: Piece,
  match: Move,
  getPiece: (sq: Square) => Piece | null,
): string {
  const castleDetails = getCastlingDetails(from, to, leadingPiece, getPiece);
  if (castleDetails) {
    return castleDetails.kingTo[0] === 'c' ? 'O-O-O' : 'O-O';
  }
  if (match.san) return match.san;
  const pieceChar = leadingPiece.type === 'p' ? '' : leadingPiece.type.toUpperCase();
  const promoStr = promotion ? `=${promotion.toUpperCase()}` : '';
  return `${pieceChar}${from}-${to}${promoStr}`;
}

export function pieceName(type: PieceType): string {
  return ({ p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' } as const)[type];
}

export function formatMoveNotation(san: string, followers: PlannedFollower[]): string {
  if (followers.length === 0) return san;
  const trailer = followers
    .map((f) => {
      const promoStr = f.piece.type === 'p' && f.promotion ? `=${f.promotion.toUpperCase()}` : '';
      const sep = f.to ? '-' : 'x';
      const target = f.to ?? '';
      return `${pieceName(f.piece.type)}${f.from}${sep}${target}${promoStr}`;
    })
    .join(', ');
  return `${san} + ${trailer}`;
}

export function finalizeMoveState(
  fenBefore: string,
  from: Square,
  to: Square,
  _promotion: PieceType | undefined,
  leadingPiece: Piece,
  followers: PlannedFollower[],
  chess: Chess,
  getPiece: (sq: Square) => Piece | null,
): Chess {
  const currentFen = chess.fen();
  const parts = fenBefore.split(' ');
  const boardFen = currentFen.split(' ')[0];
  const turn = leadingPiece.color;
  const nextTurn = turn === 'w' ? 'b' : 'w';
  let castling = parts[2] || '-';
  let ep = '-';
  let halfmove = parseInt(parts[4] || '0', 10);
  let fullmove = parseInt(parts[5] || '1', 10);

  if (turn === 'b') fullmove++;

  const castleDetails = getCastlingDetails(from, to, leadingPiece, getPiece);

  const isCapture =
    (!castleDetails && getPiece(to) !== null) ||
    followers.some((f) => f.to !== null && getPiece(f.to) !== null);

  if (leadingPiece.type === 'p' || isCapture) {
    halfmove = 0;
  } else {
    halfmove++;
  }

  const { dr } = getDelta(from, to);
  if (leadingPiece.type === 'p' && Math.abs(dr) === 2) {
    const epRank = turn === 'w' ? '3' : '6';
    ep = `${from[0]}${epRank}`;
  }

  if (castling !== '-') {
    const movedOrCaptured = new Set<Square>([
      from,
      to,
      ...(castleDetails ? [castleDetails.kingFrom, castleDetails.rookFrom] : []),
      ...followers.map((f) => f.from),
      ...followers
        .filter((f): f is PlannedFollower & { to: Square } => f.to !== null)
        .map((f) => f.to),
    ]);
    if (movedOrCaptured.has('e1') || (leadingPiece.type === 'k' && turn === 'w')) {
      castling = castling.replace(/K|Q/g, '');
    }
    if (movedOrCaptured.has('e8') || (leadingPiece.type === 'k' && turn === 'b')) {
      castling = castling.replace(/k|q/g, '');
    }
    if (movedOrCaptured.has('h1')) castling = castling.replace('K', '');
    if (movedOrCaptured.has('a1')) castling = castling.replace('Q', '');
    if (movedOrCaptured.has('h8')) castling = castling.replace('k', '');
    if (movedOrCaptured.has('a8')) castling = castling.replace('q', '');
    if (!castling) castling = '-';
  }

  const nextFen = `${boardFen} ${nextTurn} ${castling} ${ep} ${halfmove} ${fullmove}`;
  return new Chess(nextFen);
}
