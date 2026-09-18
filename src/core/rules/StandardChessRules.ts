import { Chess, type Square as ChessJsSquare, type PieceSymbol } from 'chess.js';
import type { RuleSet } from './RuleSet';
import type {
  Color,
  GameResult,
  GameSnapshot,
  Move,
  MoveAttemptResult,
  Piece,
  PieceType,
  Square,
} from '../types';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

function toSquare(s: ChessJsSquare): Square {
  return s as Square;
}

function toPieceType(symbol: PieceSymbol): PieceType {
  return symbol as PieceType;
}



function getResultFromChess(chess: Chess): GameResult {
  if (!chess.isGameOver()) {
    return { status: 'ongoing' };
  }
  if (chess.isCheckmate()) {
    const winner: Color = chess.turn() === 'w' ? 'b' : 'w';
    return { status: 'checkmate', winner };
  }
  if (chess.isStalemate()) {
    return { status: 'draw', reason: 'stalemate' };
  }
  if (chess.isThreefoldRepetition()) {
    return { status: 'draw', reason: 'threefold' };
  }
  if (chess.isInsufficientMaterial()) {
    return { status: 'draw', reason: 'insufficient' };
  }
  if (chess.isDraw()) {
    return { status: 'draw', reason: 'fifty-move' };
  }
  return { status: 'draw', reason: 'agreement' };
}

/**
 * Стандартные шахматные правила на базе chess.js.
 * Наследуйте от этого класса и переопределяйте методы для кастомных правил.
 */
export class StandardChessRules implements RuleSet {
  readonly name: string = 'standard';

  protected chess: Chess;
  protected moveHistory: Move[] = [];
  protected customData: Record<string, unknown> = {};
  protected currentResult: GameResult = { status: 'ongoing' };

  constructor(fen?: string) {
    this.chess = new Chess(fen);
    this.currentResult = getResultFromChess(this.chess);
  }

  createInitialState(): GameSnapshot {
    this.chess = new Chess();
    this.moveHistory = [];
    this.customData = {};
    this.currentResult = getResultFromChess(this.chess);
    return this.getSnapshot();
  }

  loadState(snapshot: GameSnapshot): void {
    this.chess = new Chess(snapshot.fen);
    this.moveHistory = [...snapshot.moveHistory];
    this.customData = snapshot.customData ? { ...snapshot.customData } : {};
    this.currentResult = snapshot.result ?? getResultFromChess(this.chess);
  }

  getSnapshot(): GameSnapshot {
    return {
      fen: this.chess.fen(),
      turn: this.chess.turn(),
      moveHistory: [...this.moveHistory],
      result: this.currentResult,
      customData: Object.keys(this.customData).length > 0 ? { ...this.customData } : undefined,
    };
  }

  getPiece(square: Square): Piece | null {
    const p = this.chess.get(square as ChessJsSquare);
    if (!p) return null;
    return { type: toPieceType(p.type), color: p.color };
  }

  getBoard(): Map<Square, Piece> {
    const board = new Map<Square, Piece>();
    for (const file of FILES) {
      for (const rank of RANKS) {
        const sq = `${file}${rank}` as Square;
        const piece = this.getPiece(sq);
        if (piece) board.set(sq, piece);
      }
    }
    return board;
  }

  getTurn(): Color {
    return this.chess.turn();
  }

  getResult(): GameResult {
    return this.currentResult;
  }

  getLegalMoves(square?: Square, _context?: import('../trailer/types').MoveContext, forColor?: Color): Move[] {
    let chessInstance = this.chess;
    if (forColor && forColor !== this.chess.turn()) {
      const parts = this.chess.fen().split(' ');
      parts[1] = forColor;
      chessInstance = new Chess(parts.join(' '));
    }

    const raw = square
      ? chessInstance.moves({ square: square as ChessJsSquare, verbose: true })
      : chessInstance.moves({ verbose: true });

    return raw.map((m) => ({
      from: toSquare(m.from),
      to: toSquare(m.to),
      promotion: m.promotion ? toPieceType(m.promotion) : undefined,
      san: m.san,
      isEnPassant: m.flags.includes('e'),
      isCastle: m.flags.includes('k') || m.flags.includes('q'),
    }));
  }

  tryMove(from: Square, to: Square, promotion?: Move['promotion'], _context?: import('../trailer/types').MoveContext): MoveAttemptResult {
    if (!this.canApplyMove(from, to, promotion)) {
      return { ok: false, reason: 'Ход не разрешён правилами' };
    }

    const move = this.chess.move({
      from: from as ChessJsSquare,
      to: to as ChessJsSquare,
      promotion: promotion ?? 'q',
    });

    if (!move) {
      return { ok: false, reason: 'Недопустимый ход' };
    }

    const recorded: Move = {
      from: toSquare(move.from),
      to: toSquare(move.to),
      promotion: move.promotion ? toPieceType(move.promotion) : undefined,
      san: move.san,
      isEnPassant: move.flags.includes('e'),
      isCastle: move.flags.includes('k') || move.flags.includes('q'),
    };

    this.moveHistory.push(recorded);
    this.currentResult = getResultFromChess(this.chess);
    this.onMoveApplied(recorded);

    return { ok: true, move: recorded, snapshot: this.getSnapshot() };
  }

  /** Хук: проверка перед ходом — переопределите для кастомных правил */
  protected canApplyMove(_from: Square, _to: Square, _promotion?: Move['promotion']): boolean {
    return true;
  }

  /** Хук: вызывается после успешного хода */
  protected onMoveApplied(_move: Move): void {}

  reset(): void {
    this.createInitialState();
  }

  getFen(): string {
    return this.chess.fen();
  }

  isInCheck(): boolean {
    return this.chess.inCheck();
  }
}
