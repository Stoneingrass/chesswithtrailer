import type {
  Color,
  GameResult,
  GameSnapshot,
  Move,
  MoveAttemptResult,
  MoveContext,
  Piece,
  Square,
} from '../types';

/**
 * Интерфейс набора правил.
 * Реализуйте этот интерфейс для кастомных вариантов (OmniChess и т.д.).
 */
export interface RuleSet {
  readonly name: string;

  /** Начальное состояние партии */
  createInitialState(): GameSnapshot;

  /** Восстановить состояние из снимка (для загрузки / мультиплеера) */
  loadState(snapshot: GameSnapshot): void;

  /** Текущий снимок состояния */
  getSnapshot(): GameSnapshot;

  /** Фигура на клетке (null — пусто) */
  getPiece(square: Square): Piece | null;

  /** Все фигуры на доске */
  getBoard(): Map<Square, Piece>;

  /** Чей сейчас ход */
  getTurn(): Color;

  /** Результат партии */
  getResult(): GameResult;

  /** Легальные ходы с клетки (или все, если square не указан) */
  getLegalMoves(square?: Square, context?: MoveContext, forColor?: Color): Move[];

  /** Попытка сделать ход */
  tryMove(from: Square, to: Square, promotion?: Move['promotion'], context?: MoveContext): MoveAttemptResult;

  /** Сброс к начальной позиции */
  reset(): void;

  /** FEN текущей позиции */
  getFen(): string;

  /** Король текущего игрока под шахом */
  isInCheck(): boolean;
}
