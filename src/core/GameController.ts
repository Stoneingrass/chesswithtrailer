import type { MoveContext, TrailerOptions } from './trailer/types';
import type { TrailerChessRules } from './rules/TrailerChessRules';
import type { RuleSet } from './rules/RuleSet';
import type {
  Color,
  GameEvent,
  GameEventListener,
  GameResult,
  GameSnapshot,
  Move,
  MoveAttemptResult,
  Piece,
  Square,
} from './types';

/**
 * Контроллер партии — связывает UI / сеть с набором правил.
 * В будущем мультиплеер будет синхронизировать GameSnapshot через этот слой.
 */
export class GameController {
  private listeners = new Set<GameEventListener>();

  constructor(private rules: RuleSet) {
    this.rules.createInitialState();
  }

  /** Заменить набор правил (например, при смене режима) */
  setRuleSet(rules: RuleSet): void {
    this.rules = rules;
    this.rules.createInitialState();
    this.emit({ type: 'reset', snapshot: this.rules.getSnapshot() });
  }

  getRuleSetName(): string {
    return this.rules.name;
  }

  getSnapshot(): GameSnapshot {
    return this.rules.getSnapshot();
  }

  loadSnapshot(snapshot: GameSnapshot): void {
    this.rules.loadState(snapshot);
    this.emit({ type: 'reset', snapshot: this.rules.getSnapshot() });
    const result = this.rules.getResult();
    if (result.status !== 'ongoing') {
      this.emit({ type: 'gameOver', result });
    }
  }

  getPiece(square: Square): Piece | null {
    return this.rules.getPiece(square);
  }

  getBoard(): Map<Square, Piece> {
    return this.rules.getBoard();
  }

  getTurn(): Color {
    return this.rules.getTurn();
  }

  getResult(): GameResult {
    return this.rules.getResult();
  }

  getLegalMoves(square?: Square, context?: MoveContext): Move[] {
    return this.rules.getLegalMoves(square, context);
  }

  tryMove(
    from: Square,
    to: Square,
    promotion?: Move['promotion'],
    context?: MoveContext,
  ): MoveAttemptResult {
    const result = this.rules.tryMove(from, to, promotion, context);
    if (result.ok) {
      this.emit({ type: 'move', move: result.move, snapshot: result.snapshot });
      const gameResult = this.rules.getResult();
      if (gameResult.status !== 'ongoing') {
        this.emit({ type: 'gameOver', result: gameResult });
      }
    }
    return result;
  }

  reset(): void {
    this.rules.reset();
    this.emit({ type: 'reset', snapshot: this.rules.getSnapshot() });
  }

  isInCheck(): boolean {
    return this.rules.isInCheck();
  }

  /** Доступно только для «шахмат с прицепом». */
  getProtectors(square: Square): Square[] {
    if ('getProtectors' in this.rules && typeof (this.rules as any).getProtectors === 'function') {
      return (this.rules as TrailerChessRules).getProtectors(square);
    }
    return [];
  }

  getDirectProtectors(square: Square): Square[] {
    if ('getDirectProtectors' in this.rules && typeof (this.rules as any).getDirectProtectors === 'function') {
      return (this.rules as TrailerChessRules).getDirectProtectors(square);
    }
    return [];
  }

  getTrailerOptions(): TrailerOptions | null {
    if ('getTrailerOptions' in this.rules) {
      return (this.rules as TrailerChessRules).getTrailerOptions();
    }
    return null;
  }

  setTrailerOptions(partial: Partial<TrailerOptions>): void {
    if ('setTrailerOptions' in this.rules) {
      (this.rules as TrailerChessRules).setTrailerOptions(partial);
    }
  }

  subscribe(listener: GameEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: GameEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
