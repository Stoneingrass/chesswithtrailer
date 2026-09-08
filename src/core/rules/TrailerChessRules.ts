import { Chess, type Square as ChessJsSquare } from 'chess.js';
import { addDelta, getDelta, getPathSquares, ALL_SQUARES } from '../boardUtils';
import type { MoveContext, TrailerOptions } from '../trailer/types';
import { loadTrailerOptions, saveTrailerOptions } from '../trailer/types';
import { StandardChessRules } from './StandardChessRules';
import type {
  Move,
  MoveAttemptResult,
  Piece,
  PieceType,
  Square,
} from '../types';

interface PlannedFollower {
  from: Square;
  to: Square | null;
  piece: Piece;
  promotion?: PieceType;
}

/**
 * «Шахматы с прицепом»: ведущая фигура ходит по стандартным правилам,
 * ведомые (защитники ведущей) смещаются на тот же вектор.
 */
export class TrailerChessRules extends StandardChessRules {
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
    saveTrailerOptions(this.options);
  }

  /** Фигуры своего цвета, непосредственно защищающие (атакующие) клетку. */
  getDirectProtectors(square: Square): Square[] {
    const color = this.getTurn();
    const protectors: Square[] = [];

    for (const sq of ALL_SQUARES) {
      const piece = this.getPiece(sq);
      if (!piece || piece.color !== color || sq === square) continue;
      if (this.pieceAttacksSquare(sq, square)) {
        protectors.push(sq);
      }
    }
    return protectors;
  }

  /** Фигуры своего цвета, защищающие клетку (включая рекурсивные цепочки, если включена опция). */
  getProtectors(square: Square): Square[] {
    const direct = this.getDirectProtectors(square);
    if (!this.options.allowRecursiveGroup || !this.options.allowMultiFollower) {
      return direct;
    }

    const set = new Set<Square>(direct);
    let changed = true;
    while (changed) {
      changed = false;
      for (const follower of [...set]) {
        for (const protector of this.getDirectProtectors(follower)) {
          if (protector !== square && !set.has(protector)) {
            const p = this.getPiece(protector);
            if (p?.type === 'k' && this.options.kingCannotBeFollower) continue;
            set.add(protector);
            changed = true;
          }
        }
      }
    }
    return [...set];
  }

  /** Псевдо-легальные ходы фигуры (без учета шаха собственному королю до сдвига прицепа). */
  public getPseudoLegalMoves(square: Square): Move[] {
    const leadingPiece = this.getPiece(square);
    if (!leadingPiece || leadingPiece.color !== this.getTurn()) return [];

    if (leadingPiece.type === 'k') {
      const moves: Move[] = [];
      const rStr = square[1];
      const r = parseInt(rStr, 10);

      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (df === 0 && dr === 0) continue;
          const target = addDelta(square, df, dr);
          if (!target) continue;
          const occ = this.getPiece(target);
          if (!occ || occ.color !== leadingPiece.color) {
            moves.push({ from: square, to: target });
          }
        }
      }

      // Рокировка (если есть права и свободные поля)
      if (square === `e${r}`) {
        const movesRaw = this.chess.moves({ square: square as ChessJsSquare, verbose: true });
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

    // Для остальных фигур: временно убираем короля активного цвета, чтобы chess.js не отфильтровал псевдо-легальные ходы из-за шаха
    const turn = leadingPiece.color;
    const kingSq = ALL_SQUARES.find((sq) => {
      const p = this.getPiece(sq);
      return p?.type === 'k' && p.color === turn;
    });

    if (kingSq) {
      this.chess.remove(kingSq as ChessJsSquare);
    }

    const raw = this.chess.moves({ square: square as ChessJsSquare, verbose: true });

    if (kingSq) {
      this.chess.put({ type: 'k', color: turn }, kingSq as ChessJsSquare);
    }

    return raw.map((m) => ({
      from: m.from as Square,
      to: m.to as Square,
      promotion: m.promotion ? (m.promotion as PieceType) : undefined,
      san: m.san,
      isEnPassant: m.flags.includes('e'),
      isCastle: m.flags.includes('k') || m.flags.includes('q'),
    }));
  }

  override getLegalMoves(square?: Square, context?: MoveContext): Move[] {
    if (!square) {
      const allMoves: Move[] = [];
      const turn = this.getTurn();
      for (const sq of ALL_SQUARES) {
        const p = this.getPiece(sq);
        if (p && p.color === turn) {
          allMoves.push(...this.getLegalMoves(sq, context));
        }
      }
      return allMoves;
    }

    const candidateMoves = this.getPseudoLegalMoves(square);
    const followers = context?.followers ?? [];
    const group = this.resolveFollowerGroup(square, followers);

    return candidateMoves.filter((m) => {
      const validation = this.validateTrailerMove(m.from, m.to, group, m.promotion, context);
      if (!validation.ok) return false;
      return this.isTrailerMoveKingSafe(m.from, m.to, m.promotion, validation.followers);
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
    const group = this.resolveFollowerGroup(from, followers);
    const validation = this.validateTrailerMove(from, to, group, promotion, context);
    if (!validation.ok) {
      return { ok: false, reason: validation.reason };
    }

    const leadingPromotion = leadingPiece.type === 'p' ? promotion : undefined;
    const plannedFollowers = validation.followers;
    const fenBeforeMove = this.chess.fen();

    this.applyFullMove(from, to, leadingPromotion, plannedFollowers, leadingPiece);

    if (this.isKingAttacked(leadingPiece.color)) {
      this.chess = new Chess(fenBeforeMove);
      return { ok: false, reason: 'После перемещения группы король остаётся под шахом' };
    }

    const san = this.formatMoveNotation(
      this.generateSanForMove(from, to, leadingPromotion, leadingPiece, pseudoMatch),
      plannedFollowers,
    );

    this.finalizeMoveState(fenBeforeMove, from, to, leadingPromotion, leadingPiece, plannedFollowers);

    const recorded: Move = {
      from: from,
      to: to,
      promotion: leadingPromotion,
      san: san,
      isEnPassant: pseudoMatch.isEnPassant,
      isCastle: pseudoMatch.isCastle,
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

  private applyFullMove(
    from: Square,
    to: Square,
    promotion: PieceType | undefined,
    followers: PlannedFollower[],
    leadingPiece: Piece,
  ): void {
    this.chess.remove(from as ChessJsSquare);

    // Удаление при взятии на проходе
    if (leadingPiece.type === 'p' && from[0] !== to[0] && !this.getPiece(to)) {
      const epCapturedSq = `${to[0]}${from[1]}` as Square;
      this.chess.remove(epCapturedSq as ChessJsSquare);
    }

    const leadingType = leadingPiece.type === 'p' && promotion ? promotion : leadingPiece.type;

    this.chess.put(
      { type: leadingType, color: leadingPiece.color },
      to as ChessJsSquare,
    );

    const castleRook = this.getCastlingRookShift(from, to, leadingPiece.type);
    if (castleRook) {
      this.chess.remove(castleRook.from as ChessJsSquare);
      this.chess.put({ type: 'r', color: leadingPiece.color }, castleRook.to as ChessJsSquare);
    }

    this.applyFollowerShifts(followers);
  }

  private generateSanForMove(
    from: Square,
    to: Square,
    promotion: PieceType | undefined,
    leadingPiece: Piece,
    match: Move,
  ): string {
    if (match.san) return match.san;
    const pieceChar = leadingPiece.type === 'p' ? '' : leadingPiece.type.toUpperCase();
    const promoStr = promotion ? `=${promotion.toUpperCase()}` : '';
    return `${pieceChar}${from}-${to}${promoStr}`;
  }

  private finalizeMoveState(
    fenBefore: string,
    from: Square,
    to: Square,
    _promotion: PieceType | undefined,
    leadingPiece: Piece,
    followers: PlannedFollower[],
  ): void {
    const currentFen = this.chess.fen();
    const parts = fenBefore.split(' ');
    const boardFen = currentFen.split(' ')[0];
    const turn = leadingPiece.color;
    const nextTurn = turn === 'w' ? 'b' : 'w';
    let castling = parts[2] || '-';
    let ep = '-';
    let halfmove = parseInt(parts[4] || '0', 10);
    let fullmove = parseInt(parts[5] || '1', 10);

    if (turn === 'b') fullmove++;

    const isCapture =
      this.getPiece(to) !== null ||
      followers.some((f) => f.to !== null && this.getPiece(f.to) !== null);

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
    this.chess = new Chess(nextFen);
  }

  private pieceAttacksSquare(from: Square, target: Square): boolean {
    const piece = this.getPiece(from);
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
        return absFile === absRank && this.pathIsClear(from, target);
      case 'r':
        return (df === 0 || dr === 0) && this.pathIsClear(from, target);
      case 'q':
        return (df === 0 || dr === 0 || absFile === absRank) && this.pathIsClear(from, target);
    }
  }

  /** Проверка атаки не использует список легальных ходов: он не содержит свои занятые клетки. */
  private pathIsClear(from: Square, to: Square): boolean {
    return getPathSquares(from, to).every((square) => !this.getPiece(square));
  }

  private resolveFollowerGroup(leading: Square, selected: Square[]): Square[] {
    let group = new Set<Square>(selected.filter((sq) => sq !== leading));

    if (!this.options.allowMultiFollower && group.size > 1) {
      const first = selected[0];
      group = new Set(first ? [first] : []);
    }

    return [...group];
  }

  private validateTrailerMove(
    leadingFrom: Square,
    leadingTo: Square,
    followers: Square[],
    promotion?: PieceType,
    context?: MoveContext,
  ): { ok: true; followers: PlannedFollower[] } | { ok: false; reason: string } {
    const leadingPiece = this.getPiece(leadingFrom);
    if (!leadingPiece) {
      return { ok: false, reason: 'Нет ведущей фигуры' };
    }

    for (const sq of followers) {
      if (sq === leadingFrom) {
        return { ok: false, reason: 'Ведомая не может быть ведущей фигурой' };
      }
      const p = this.getPiece(sq);
      if (!p || p.color !== leadingPiece.color) {
        return { ok: false, reason: 'Ведомая должна быть своей фигурой' };
      }
      if (p.type === 'k' && this.options.kingCannotBeFollower) {
        return { ok: false, reason: 'Король не может быть ведомой фигурой' };
      }
      const protectsLeading = this.pieceAttacksSquare(sq, leadingFrom);
      const protectsOtherFollower = followers.some(
        (other) => other !== sq && this.pieceAttacksSquare(sq, other),
      );
      if (!protectsLeading && !protectsOtherFollower) {
        return { ok: false, reason: 'Ведомая должна защищать ведущую фигуру или другую ведомую' };
      }
      if (!this.options.allowRecursiveGroup && !protectsLeading) {
        return { ok: false, reason: 'Ведомая должна защищать ведущую фигуру' };
      }
    }

    // Проверка целостности цепи защиты до ведущей фигуры
    const connected = new Set<Square>([leadingFrom]);
    let added = true;
    while (added) {
      added = false;
      for (const sq of followers) {
        if (!connected.has(sq)) {
          const attacksConnected = [...connected].some((target) =>
            this.pieceAttacksSquare(sq, target),
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

    const { df, dr } = getDelta(leadingFrom, leadingTo);
    const planned: PlannedFollower[] = [];
    const destinations = new Map<Square | 'off', Square>();
    destinations.set(leadingTo, leadingFrom);
    const movingFrom = new Set<Square>([leadingFrom, ...followers]);
    const castleRook = this.getCastlingRookShift(leadingFrom, leadingTo, leadingPiece.type);
    if (castleRook) {
      movingFrom.add(castleRook.from);
    }

    for (const from of followers) {
      const piece = this.getPiece(from)!;
      const to = addDelta(from, df, dr);

      if (to === null) {
        if (!this.options.followerOffBoardRemoved) {
          return { ok: false, reason: 'Ведомая фигура выходит за границы доски' };
        }
        planned.push({ from, to: null, piece });
        continue;
      }

      if (to === leadingTo) {
        return { ok: false, reason: 'Ведомая не может встать на клетку ведущей' };
      }
      if (to === castleRook?.to) {
        return { ok: false, reason: 'Ведомая не может занять клетку ладьи при рокировке' };
      }

      if (destinations.has(to)) {
        return { ok: false, reason: 'Две фигуры не могут занять одну клетку' };
      }
      destinations.set(to, from);

      const occupant = this.getPiece(to);
      if (occupant) {
        if (occupant.color === piece.color) {
          if (!movingFrom.has(to)) {
            if (!this.options.allowFollowerFriendlyCapture || occupant.type === 'k') {
              return { ok: false, reason: 'Ведомая не может сбить фигуру своего цвета' };
            }
          }
        } else if (
          !this.options.allowGroupCapture &&
          !this.options.allowFollowerCaptureWithoutLeadingCapture
        ) {
          return { ok: false, reason: 'Ведомая не может брать без опции группового взятия' };
        } else if (occupant.type === 'k') {
          return { ok: false, reason: 'Ведомая не может брать короля' };
        } else if (
          !this.options.allowFollowerCaptureWithoutLeadingCapture &&
          !this.getPiece(leadingTo)
        ) {
          return { ok: false, reason: 'Ведомая может брать только вместе со взятием ведущей' };
        }
      }

      const pathOk = this.validateFollowerPath(from, to, leadingPiece.type, movingFrom, leadingTo);
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

  private getCastlingRookShift(
    from: Square,
    to: Square,
    leadingType: PieceType,
  ): { from: Square; to: Square } | null {
    if (leadingType !== 'k' || from[1] !== to[1]) return null;
    const { df } = getDelta(from, to);
    if (Math.abs(df) !== 2) return null;
    const rank = from[1];
    return df > 0
      ? { from: `h${rank}` as Square, to: `f${rank}` as Square }
      : { from: `a${rank}` as Square, to: `d${rank}` as Square };
  }

  private validateFollowerPath(
    from: Square,
    to: Square,
    leadingType: PieceType,
    movingFrom: Set<Square>,
    leadingTo: Square,
  ): { ok: true } | { ok: false; reason: string } {
    const passThroughAllowed = this.options.allowPassThrough || leadingType === 'n';

    if (passThroughAllowed) return { ok: true };

    for (const sq of getPathSquares(from, to)) {
      if (movingFrom.has(sq) || sq === leadingTo) continue;
      if (this.getPiece(sq)) {
        return { ok: false, reason: 'Путь ведомой фигуры заблокирован' };
      }
    }
    return { ok: true };
  }

  private applyFollowerShifts(planned: PlannedFollower[]): void {
    for (const { from } of planned) {
      this.chess.remove(from as ChessJsSquare);
    }

    for (const { to, piece, promotion } of planned) {
      if (to === null) continue;

      const occupant = this.chess.get(to as ChessJsSquare);
      if (occupant) {
        this.chess.remove(to as ChessJsSquare);
      }

      const finalType = piece.type === 'p' && promotion ? promotion : piece.type;

      this.chess.put(
        { type: finalType as PieceType, color: piece.color },
        to as ChessJsSquare,
      );
    }
  }

  private formatMoveNotation(san: string, followers: PlannedFollower[]): string {
    if (followers.length === 0) return san;
    const trailer = followers
      .map((f) => {
        const promoStr = f.piece.type === 'p' && f.promotion ? `=${f.promotion.toUpperCase()}` : '';
        return `${this.pieceName(f.piece.type)}${f.from}${f.to ? `→${f.to}` : '×'}${promoStr}`;
      })
      .join(', ');
    return `${san} + ${trailer}`;
  }

  private isKingAttacked(color: 'w' | 'b'): boolean {
    const kingSquare = ALL_SQUARES.find((square) => {
      const piece = this.getPiece(square);
      return piece?.type === 'k' && piece.color === color;
    });
    if (!kingSquare) return true;
    const attacker = color === 'w' ? 'b' : 'w';
    return this.chess.isAttacked(kingSquare as ChessJsSquare, attacker);
  }

  private isTrailerMoveKingSafe(
    from: Square,
    to: Square,
    promotion: PieceType | undefined,
    followers: PlannedFollower[],
  ): boolean {
    const leadingPiece = this.getPiece(from);
    if (!leadingPiece) return false;
    const fenBeforeMove = this.chess.fen();
    try {
      this.applyFullMove(from, to, promotion, followers, leadingPiece);
      return !this.isKingAttacked(leadingPiece.color);
    } finally {
      this.chess = new Chess(fenBeforeMove);
    }
  }

  private pieceName(type: PieceType): string {
    return ({ p: 'П', n: 'К', b: 'С', r: 'Л', q: 'Ф', k: 'Кр' } as const)[type];
  }
}
