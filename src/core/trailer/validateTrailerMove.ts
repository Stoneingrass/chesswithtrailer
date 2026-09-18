import { addDelta, getDelta, getPathSquares, parseSquare, toSquare } from '../boardUtils';
import type { MoveContext, Piece, PieceType, Square } from '../types';
import type { PlannedFollower, TrailerOptions } from './types';
import { getCastlingDetails } from './castling';
import { pieceAttacksSquare } from './protectors';

export function getKnightCandidatePaths(from: Square, df: number, dr: number): Array<Array<Square | null>> {
  const { file, rank } = parseSquare(from);
  const absF = Math.abs(df);
  const absR = Math.abs(dr);
  const signF = df === 0 ? 0 : df / absF;
  const signR = dr === 0 ? 0 : dr / absR;

  if (absR === 2 && absF === 1) {
    return [
      [toSquare(file, rank + signR), toSquare(file, rank + 2 * signR)],
      [toSquare(file, rank + signR), toSquare(file + signF, rank + signR)],
      [toSquare(file + signF, rank), toSquare(file + signF, rank + signR)],
    ];
  } else if (absF === 2 && absR === 1) {
    return [
      [toSquare(file + signF, rank), toSquare(file + 2 * signF, rank)],
      [toSquare(file + signF, rank), toSquare(file + signF, rank + signR)],
      [toSquare(file, rank + signR), toSquare(file + signF, rank + signR)],
    ];
  }

  return [];
}

export function isKnightPathClearForPiece(
  intermSquares: Array<Square | null>,
  movingFrom: Set<Square>,
  getPiece: (sq: Square) => Piece | null,
): boolean {
  for (const sq of intermSquares) {
    if (sq === null) return false;
    const piece = getPiece(sq);
    if (piece !== null && !movingFrom.has(sq)) {
      return false;
    }
  }
  return true;
}

export function hasAnyClearKnightPathForPiece(
  fromSq: Square,
  df: number,
  dr: number,
  movingFrom: Set<Square>,
  getPiece: (sq: Square) => Piece | null,
): boolean {
  const candidatePaths = getKnightCandidatePaths(fromSq, df, dr);
  for (const pathSquares of candidatePaths) {
    if (pathSquares && isKnightPathClearForPiece(pathSquares, movingFrom, getPiece)) {
      return true;
    }
  }
  return false;
}

export function validateKnightTrailerJumping(
  movingFrom: Set<Square>,
  df: number,
  dr: number,
  getPiece: (sq: Square) => Piece | null,
): { ok: true } | { ok: false; reason: string } {
  const movingArray = [...movingFrom];
  if (movingArray.length === 0) return { ok: true };

  for (let pathIdx = 0; pathIdx < 3; pathIdx++) {
    let pathClearForEntireGroup = true;
    for (const fromSq of movingArray) {
      const candidatePaths = getKnightCandidatePaths(fromSq, df, dr);
      const pathSquares = candidatePaths[pathIdx];
      if (!pathSquares || !isKnightPathClearForPiece(pathSquares, movingFrom, getPiece)) {
        pathClearForEntireGroup = false;
        break;
      }
    }
    if (pathClearForEntireGroup) {
      return { ok: true };
    }
  }

  return { ok: false, reason: 'Конь с "прицепом" не может перепрыгивать фигуры' };
}

export function resolveFollowerGroup(
  leading: Square,
  selected: Square[],
  allowMultiFollower: boolean,
): Square[] {
  let group = new Set<Square>(selected.filter((sq) => sq !== leading));

  if (!allowMultiFollower && group.size > 1) {
    const first = selected[0];
    group = new Set(first ? [first] : []);
  }

  return [...group];
}

export function validateFollowerPath(
  from: Square,
  to: Square,
  leadingType: PieceType,
  movingFrom: Set<Square>,
  leadingTo: Square,
  options: TrailerOptions,
  getPiece: (sq: Square) => Piece | null,
): { ok: true } | { ok: false; reason: string } {
  const passThroughAllowed = options.allowPassThrough || leadingType === 'n';

  if (passThroughAllowed) return { ok: true };

  for (const sq of getPathSquares(from, to)) {
    if (movingFrom.has(sq) || sq === leadingTo) continue;
    if (getPiece(sq)) {
      return { ok: false, reason: 'Путь ведомой фигуры заблокирован' };
    }
  }
  return { ok: true };
}

export function validateTrailerMove(
  leadingFrom: Square,
  leadingTo: Square,
  followers: Square[],
  options: TrailerOptions,
  getPiece: (sq: Square) => Piece | null,
  promotion?: PieceType,
  context?: MoveContext,
): { ok: true; followers: PlannedFollower[] } | { ok: false; reason: string } {
  const leadingPiece = getPiece(leadingFrom);
  if (!leadingPiece) {
    return { ok: false, reason: 'Нет ведущей фигуры' };
  }

  const castleDetails = getCastlingDetails(leadingFrom, leadingTo, leadingPiece, getPiece);

  for (const sq of followers) {
    if (sq === leadingFrom) {
      return { ok: false, reason: 'Ведомая не может быть ведущей фигурой' };
    }
    if (castleDetails && (sq === castleDetails.kingFrom || sq === castleDetails.rookFrom)) {
      return { ok: false, reason: 'Король и ладья при рокировке являются ведущими фигурами' };
    }
    const p = getPiece(sq);
    if (!p || p.color !== leadingPiece.color) {
      return { ok: false, reason: 'Ведомая должна быть своей фигурой' };
    }
    if (p.type === 'k' && options.kingCannotBeFollower) {
      return { ok: false, reason: 'Король не может быть ведомой фигурой' };
    }
    const protectsLeading = pieceAttacksSquare(sq, leadingFrom, getPiece);
    const protectsCastleAssoc = castleDetails
      ? pieceAttacksSquare(sq, castleDetails.kingFrom, getPiece) ||
        pieceAttacksSquare(sq, castleDetails.rookFrom, getPiece)
      : false;
    const protectsOtherFollower = followers.some(
      (other) => other !== sq && pieceAttacksSquare(sq, other, getPiece),
    );

    if (!protectsLeading && !protectsCastleAssoc && !protectsOtherFollower) {
      return { ok: false, reason: 'Ведомая должна защищать ведущую фигуру или другую ведомую' };
    }
  }

  // Проверка целостности цепи защиты до ведущей фигуры
  const rootSquares = castleDetails ? [castleDetails.kingFrom, castleDetails.rookFrom] : [leadingFrom];
  const connected = new Set<Square>(rootSquares);
  let added = true;
  while (added) {
    added = false;
    for (const sq of followers) {
      if (!connected.has(sq)) {
        const attacksConnected = [...connected].some((target) =>
          pieceAttacksSquare(sq, target, getPiece),
        );
        if (attacksConnected) {
          connected.add(sq);
          added = true;
        }
      }
    }
  }
  for (const sq of followers) {
    if (!connected.has(sq)) {
      return { ok: false, reason: 'Ведомая фигура должна быть связана цепью защиты с ведущей' };
    }
  }

  const { df: defaultDf, dr: defaultDr } = getDelta(leadingFrom, leadingTo);
  const planned: PlannedFollower[] = [];
  const destinations = new Map<Square | 'off', Square>();

  if (castleDetails) {
    destinations.set(castleDetails.kingTo, castleDetails.kingFrom);
    destinations.set(castleDetails.rookTo, castleDetails.rookFrom);
  } else {
    destinations.set(leadingTo, leadingFrom);
  }

  const movingFrom = new Set<Square>(
    castleDetails
      ? [castleDetails.kingFrom, castleDetails.rookFrom, ...followers]
      : [leadingFrom, ...followers],
  );

  if (options.disallowKnightFollowerJumping && leadingPiece.type === 'n' && followers.length > 0) {
    for (const followerFrom of followers) {
      if (!hasAnyClearKnightPathForPiece(followerFrom, defaultDf, defaultDr, movingFrom, getPiece)) {
        return { ok: false, reason: 'Ведомая фигура за конём не может перепрыгивать через фигуры' };
      }
    }

    if (options.disallowKnightTrailerJumping) {
      const knightJumpOk = validateKnightTrailerJumping(movingFrom, defaultDf, defaultDr, getPiece);
      if (!knightJumpOk.ok) return knightJumpOk;
    }
  }

  for (const from of followers) {
    const piece = getPiece(from)!;

    let followerDelta = { df: defaultDf, dr: defaultDr };
    if (castleDetails) {
      const protectsRookChain = pieceAttacksSquare(from, castleDetails.rookFrom, getPiece);
      const protectsKingChain = pieceAttacksSquare(from, castleDetails.kingFrom, getPiece);
      if (protectsRookChain && !protectsKingChain) {
        followerDelta = castleDetails.deltaRook;
      } else {
        followerDelta = castleDetails.deltaKing;
      }
    }

    const to = addDelta(from, followerDelta.df, followerDelta.dr);

    if (to === null) {
      if (!options.followerOffBoardRemoved) {
        return { ok: false, reason: 'Ведомая фигура выходит за границы доски' };
      }
      planned.push({ from, to: null, piece });
      continue;
    }

    if (destinations.has(to)) {
      return { ok: false, reason: 'Две фигуры не могут занять одну клетку' };
    }
    destinations.set(to, from);

    const occupant = getPiece(to);
    if (occupant) {
      if (occupant.color === piece.color) {
        if (!movingFrom.has(to)) {
          if (!options.allowFollowerFriendlyCapture || occupant.type === 'k') {
            return { ok: false, reason: 'Ведомая не может сбить фигуру своего цвета' };
          }
        }
      } else if (
        !options.allowGroupCapture &&
        !options.allowFollowerCaptureWithoutLeadingCapture
      ) {
        return { ok: false, reason: 'Ведомая не может брать без опции группового взятия' };
      } else if (occupant.type === 'k') {
        return { ok: false, reason: 'Ведомая не может брать короля' };
      }
    }

    const pathOk = validateFollowerPath(
      from,
      to,
      leadingPiece.type,
      movingFrom,
      leadingTo,
      options,
      getPiece,
    );
    if (!pathOk.ok) return pathOk;

    let followerPromotion: PieceType | undefined = undefined;
    if (piece.type === 'p' && to !== null) {
      const lastRank = piece.color === 'w' ? '8' : '1';
      if (to[1] === lastRank) {
        followerPromotion = context?.followerPromotions?.[from] || promotion || 'q';
      }
    }

    planned.push({ from, to, piece, promotion: followerPromotion });
  }

  return { ok: true, followers: planned };
}
