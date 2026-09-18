import { Chess } from 'chess.js';
import { ALL_SQUARES } from '../boardUtils';
import type { MoveContext, TrailerOptions } from '../trailer/types';
import { loadTrailerOptions, saveTrailerOptions } from '../trailer/types';
import { StandardChessRules } from './StandardChessRules';
import type { TrailerCapabilities } from './TrailerCapabilities';
import type {
  Color,
  Move,
  MoveAttemptResult,
  Piece,
  Square,
} from '../types';

import {
  getDirectProtectors,
  getProtectors,
} from '../trailer/protectors';

import {
  getCastlingAssociatedSquares,
  getCastlingDetails,
  type CastlingDetails,
} from '../trailer/castling';

import { getPseudoLegalMoves } from '../trailer/pseudoLegal';

import {
  resolveFollowerGroup,
  validateTrailerMove,
} from '../trailer/validateTrailerMove';

import {
  applyFullMove,
  finalizeMoveState,
  formatMoveNotation,
  generateSanForMove,
} from '../trailer/applyTrailerMove';

import {
  isKingAttacked,
  isTrailerMoveKingSafe,
} from '../trailer/kingSafety';

/**
 * «Шахматы с прицепом»: ведущая фигура ходит по стандартным правилам,
 * ведомые (защитники ведущей) смещаются на тот же вектор.
 */
export class TrailerChessRules extends StandardChessRules implements TrailerCapabilities {
  override readonly name = 'Шахматы с "прицепом"';

  private options: TrailerOptions;

  constructor(options?: Partial<TrailerOptions>) {
    super();
    this.options = { ...loadTrailerOptions(), ...options };
    if (!this.options.allowMultiFollower) this.options.allowRecursiveGroup = false;
  }

  getTrailerOptions(): TrailerOptions {
    return { ...this.options };
  }

  setTrailerOptions(partial: Partial<TrailerOptions>): void {
    this.options = { ...this.options, ...partial };
    if (!this.options.allowMultiFollower) {
      this.options.allowRecursiveGroup = false;
    }
    if (!this.options.allowFollowerCaptureWithoutLeadingCapture) {
      this.options.allowGroupCapture = false;
      this.options.allowFollowerFriendlyCapture = false;
    }
    if (!this.options.disallowKnightFollowerJumping) {
      this.options.disallowKnightTrailerJumping = false;
    }
    if (this.options.allowPassThrough) {
      this.options.disallowKnightFollowerJumping = false;
      this.options.disallowKnightTrailerJumping = false;
    }
    saveTrailerOptions(this.options);
  }

  /** Фигуры своего цвета, непосредственно защищающие (атакующие) клетку. */
  getDirectProtectors(square: Square): Square[] {
    const piece = this.getPiece(square);
    if (!piece) return [];
    return getDirectProtectors(square, piece.color, (sq) => this.getPiece(sq));
  }

  /** Фигуры своего цвета, защищающие клетку (включая рекурсивные цепочки, если включена опция). */
  getProtectors(square: Square): Square[] {
    const piece = this.getPiece(square);
    if (!piece) return [];
    return getProtectors(square, this.options, piece.color, (sq) => this.getPiece(sq));
  }

  /** Возвращает связанные фигуры для рокировки (король <-> ладья) */
  public getCastlingAssociatedSquares(square: Square): Square[] {
    return getCastlingAssociatedSquares(square, this.chess, (sq) => this.getPiece(sq));
  }

  public getCastlingDetails(
    from: Square,
    to: Square,
    piece?: Piece,
  ): CastlingDetails | null {
    return getCastlingDetails(from, to, piece, (sq) => this.getPiece(sq));
  }

  /** Псевдо-легальные ходы фигуры (без учета шаха собственному королю до сдвига прицепа). */
  public getPseudoLegalMoves(square: Square, forColor?: Color): Move[] {
    const turn = forColor ?? this.getTurn();
    return getPseudoLegalMoves(square, turn, this.chess, (sq) => this.getPiece(sq));
  }

  override getLegalMoves(square?: Square, context?: MoveContext, forColor?: Color): Move[] {
    const turn = forColor ?? this.getTurn();
    if (!square) {
      const allMoves: Move[] = [];
      for (const sq of ALL_SQUARES) {
        const p = this.getPiece(sq);
        if (p && p.color === turn) {
          allMoves.push(...this.getLegalMoves(sq, context, turn));
        }
      }
      return allMoves;
    }

    const candidateMoves = this.getPseudoLegalMoves(square, turn);
    const followers = context?.followers ?? [];
    const group = resolveFollowerGroup(square, followers, this.options.allowMultiFollower);

    let chessInstance = this.chess;
    if (forColor && forColor !== this.chess.turn()) {
      const parts = this.chess.fen().split(' ');
      parts[1] = forColor;
      chessInstance = new Chess(parts.join(' '));
    }

    return candidateMoves.filter((m) => {
      const validation = validateTrailerMove(
        m.from,
        m.to,
        group,
        this.options,
        (sq) => this.getPiece(sq),
        m.promotion,
        context,
      );
      if (!validation.ok) return false;
      return isTrailerMoveKingSafe(
        m.from,
        m.to,
        m.promotion,
        validation.followers,
        chessInstance,
        (sq) => this.getPiece(sq),
      );
    });
  }

  override tryMove(
    from: Square,
    to: Square,
    promotion?: Move['promotion'],
    context?: MoveContext,
  ): MoveAttemptResult {
    const leadingPiece = this.getPiece(from);
    if (!leadingPiece || leadingPiece.color !== this.getTurn()) {
      return { ok: false, reason: 'Не ваш ход' };
    }

    const pseudoMoves = this.getPseudoLegalMoves(from);
    const pseudoMatch = pseudoMoves.find(
      (m) => m.to === to && (!promotion || m.promotion === promotion || !m.promotion),
    );
    if (!pseudoMatch) {
      return { ok: false, reason: 'Недопустимый ход ведущей фигуры' };
    }

    const followers = context?.followers ?? [];
    const group = resolveFollowerGroup(from, followers, this.options.allowMultiFollower);
    const validation = validateTrailerMove(
      from,
      to,
      group,
      this.options,
      (sq) => this.getPiece(sq),
      promotion,
      context,
    );
    if (!validation.ok) {
      return { ok: false, reason: validation.reason };
    }

    const leadingPromotion = leadingPiece.type === 'p' ? promotion : undefined;
    const plannedFollowers = validation.followers;
    const fenBeforeMove = this.chess.fen();

    applyFullMove(
      from,
      to,
      leadingPromotion,
      plannedFollowers,
      leadingPiece,
      this.chess,
      (sq) => this.getPiece(sq),
    );

    if (isKingAttacked(leadingPiece.color, this.chess, (sq) => this.getPiece(sq))) {
      this.chess = new Chess(fenBeforeMove);
      return { ok: false, reason: 'После перемещения группы король остаётся под шахом' };
    }

    const san = formatMoveNotation(
      generateSanForMove(from, to, leadingPromotion, leadingPiece, pseudoMatch, (sq) =>
        this.getPiece(sq),
      ),
      plannedFollowers,
    );

    this.chess = finalizeMoveState(
      fenBeforeMove,
      from,
      to,
      leadingPromotion,
      leadingPiece,
      plannedFollowers,
      this.chess,
      (sq) => this.getPiece(sq),
    );

    const recorded: Move = {
      from: from,
      to: to,
      promotion: leadingPromotion,
      san: san,
      isEnPassant: pseudoMatch.isEnPassant,
      isCastle: pseudoMatch.isCastle || !!this.getCastlingDetails(from, to, leadingPiece),
      followers: plannedFollowers.map((f) => ({
        from: f.from,
        to: f.to ?? f.from,
        piece: f.piece.type === 'p' && f.promotion ? f.promotion : f.piece.type,
        removed: f.to === null,
      })),
    };

    this.moveHistory.push(recorded);
    this.onMoveApplied(recorded);

    return { ok: true, move: recorded, snapshot: this.getSnapshot() };
  }
}
