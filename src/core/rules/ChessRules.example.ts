/**
 * Пример расширения правил для OmniChess.
 * Не подключён по умолчанию — скопируйте и адаптируйте под свои правила.
 *
 * Использование:
 *   import { OmniChessRules } from './core/rules/OmniChessRules.example';
 *   const game = new GameController(new OmniChessRules());
 */

import { StandardChessRules } from './StandardChessRules';
import type { Move, Square } from '../types';

export class OmniChessRules extends StandardChessRules {
  override readonly name = 'omnichess';

  /**
   * Переопределите canApplyMove для дополнительных ограничений
   * (например, запрет определённых ходов, особые зоны доски).
   */
  protected override canApplyMove(from: Square, to: Square, promotion?: Move['promotion']): boolean {
    if (!super.canApplyMove(from, to, promotion)) return false;

    // TODO: ваши кастомные правила здесь
    return true;
  }

  /**
   * Переопределите onMoveApplied для пост-обработки хода
   * (спецэффекты, изменение customData, дополнительные фигуры).
   */
  protected override onMoveApplied(move: Move): void {
    super.onMoveApplied(move);
    // TODO: ваши кастомные эффекты после хода
  }
}
