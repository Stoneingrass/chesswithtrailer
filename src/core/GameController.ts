import type { MoveContext, TrailerOptions } from './trailer/types';
import { isTrailerRules } from './rules/TrailerCapabilities';
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
  private snapshotHistory: GameSnapshot[] = [];

  constructor(private rules: RuleSet) {
    this.rules.createInitialState();
    this.snapshotHistory = [this.rules.getSnapshot()];
  }

  /** Заменить набор правил (например, при смене режима) */
  setRuleSet(rules: RuleSet): void {
    this.rules = rules;
    this.rules.createInitialState();
    this.snapshotHistory = [this.rules.getSnapshot()];
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
    this.snapshotHistory = [this.rules.getSnapshot()];
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
      this.snapshotHistory.push(result.snapshot);
      this.emit({ type: 'move', move: result.move, snapshot: result.snapshot });
      const gameResult = this.rules.getResult();
      if (gameResult.status !== 'ongoing') {
        this.emit({ type: 'gameOver', result: gameResult });
      }
    }
    return result;
  }

  /** Возврат на count полуходов назад */
  undo(count = 1): boolean {
    if (this.snapshotHistory.length <= 1 || count < 1) return false;
    const targetIndex = Math.max(0, this.snapshotHistory.length - 1 - count);
    this.snapshotHistory = this.snapshotHistory.slice(0, targetIndex + 1);
    const targetSnapshot = this.snapshotHistory[this.snapshotHistory.length - 1];
    this.rules.loadState(targetSnapshot);
    this.emit({ type: 'undo', snapshot: this.rules.getSnapshot(), count });
    return true;
  }

  /** Сдаться */
  resign(playerColor: Color): void {
    const winner: Color = playerColor === 'w' ? 'b' : 'w';
    const result: GameResult = { status: 'resigned', winner };
    const current = this.rules.getSnapshot();
    const resignedSnapshot: GameSnapshot = {
      ...current,
      result,
    };
    this.rules.loadState(resignedSnapshot);
    this.emit({ type: 'gameOver', result });
  }

  /** Ничья по соглашению */
  agreeDraw(): void {
    const result: GameResult = { status: 'draw', reason: 'agreement' };
    const current = this.rules.getSnapshot();
    const drawSnapshot: GameSnapshot = {
      ...current,
      result,
    };
    this.rules.loadState(drawSnapshot);
    this.emit({ type: 'gameOver', result });
  }

  reset(): void {
    this.rules.reset();
    this.snapshotHistory = [this.rules.getSnapshot()];
    this.emit({ type: 'reset', snapshot: this.rules.getSnapshot() });
  }

  /** Истёк таймер */
  timeout(winner: Color): void {
    const result: GameResult = { status: 'timeout', winner };
    const current = this.rules.getSnapshot();
    const timeoutSnapshot: GameSnapshot = {
      ...current,
      result,
    };
    this.rules.loadState(timeoutSnapshot);
    this.emit({ type: 'gameOver', result });
  }

  isInCheck(): boolean {
    return this.rules.isInCheck();
  }

  /** Доступно только для «шахмат с прицепом». */
  getProtectors(square: Square): Square[] {
    if (isTrailerRules(this.rules)) {
      return this.rules.getProtectors(square);
    }
    return [];
  }

  getDirectProtectors(square: Square): Square[] {
    if (isTrailerRules(this.rules)) {
      return this.rules.getDirectProtectors(square);
    }
    return [];
  }

  getCastlingAssociatedSquares(square: Square): Square[] {
    if (isTrailerRules(this.rules)) {
      return this.rules.getCastlingAssociatedSquares(square);
    }
    return [];
  }

  getTrailerOptions(): TrailerOptions | null {
    if (isTrailerRules(this.rules)) {
      return this.rules.getTrailerOptions();
    }
    return null;
  }

  setTrailerOptions(partial: Partial<TrailerOptions>): void {
    if (isTrailerRules(this.rules)) {
      this.rules.setTrailerOptions(partial);
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
