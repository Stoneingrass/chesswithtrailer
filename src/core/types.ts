/** Базовые типы игры — не зависят от конкретных правил. */

export type Color = 'w' | 'b';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type Square =
  | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'a7' | 'a8'
  | 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6' | 'b7' | 'b8'
  | 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8'
  | 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7' | 'd8'
  | 'e1' | 'e2' | 'e3' | 'e4' | 'e5' | 'e6' | 'e7' | 'e8'
  | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8'
  | 'g1' | 'g2' | 'g3' | 'g4' | 'g5' | 'g6' | 'g7' | 'g8'
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'h7' | 'h8';

export interface Piece {
  type: PieceType;
  color: Color;
}

export interface Move {
  from: Square;
  to: Square;
  promotion?: PieceType;
  /** SAN-нотация (для отображения) */
  san?: string;
  /** Флаг взятия на проходе */
  isEnPassant?: boolean;
  /** Флаг рокировки */
  isCastle?: boolean;
  /** Смещения ведомых фигур (вариант с прицепом) */
  followers?: Array<{ from: Square; to: Square; piece?: PieceType; removed?: boolean }>;
}

export type GameResult =
  | { status: 'ongoing' }
  | { status: 'checkmate'; winner: Color }
  | { status: 'stalemate' }
  | { status: 'draw'; reason: 'stalemate' | 'threefold' | 'fifty-move' | 'insufficient' | 'agreement' }
  | { status: 'resigned'; winner: Color };

/** Сериализуемое состояние — пригодно для синхронизации в мультиплеере. */
export interface GameSnapshot {
  fen: string;
  turn: Color;
  moveHistory: Move[];
  result: GameResult;
  /** Произвольные данные кастомных правил */
  customData?: Record<string, unknown>;
}



export type MoveAttemptResult =
  | { ok: true; move: Move; snapshot: GameSnapshot }
  | { ok: false; reason: string };

export type GameEvent =
  | { type: 'move'; move: Move; snapshot: GameSnapshot }
  | { type: 'gameOver'; result: GameResult }
  | { type: 'reset'; snapshot: GameSnapshot }
  | { type: 'undo'; snapshot: GameSnapshot; count: number };

export type GameEventListener = (event: GameEvent) => void;
