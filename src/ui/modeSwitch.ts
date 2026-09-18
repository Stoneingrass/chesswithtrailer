import type { GameController } from '../core';
import { DEFAULT_TRAILER_OPTIONS } from '../core';
import type { NetworkManager } from '../net';
import type { BoardSessionState } from './BoardSessionState';
import { clearPersistedState } from './persist/gameStateStorage';

export function switchMode(
  newMode: 'local' | 'online',
  container: HTMLElement,
  headerSubEl: HTMLElement,
  state: BoardSessionState,
  game: GameController,
  net: NetworkManager,
  renderAll: () => void,
): void {
  if (state.mode === newMode) return;
  state.mode = newMode;

  container.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === newMode);
  });

  if (newMode === 'local') {
    net.disconnect();
    headerSubEl.textContent = `Локальный режим · ${game.getRuleSetName()}`;
  } else {
    headerSubEl.textContent = `Игра по сети · ${game.getRuleSetName()}`;
  }

  game.reset();
  game.setTrailerOptions({ ...DEFAULT_TRAILER_OPTIONS });
  state.timeline = [game.getSnapshot()];
  state.timelineIndex = 0;
  state.lastMoveSquares.clear();
  state.clearSelection();
  state.drawCooldownStartMoveCount = null;
  state.drawState = 'idle';
  state.takebackState = 'idle';
  state.resignState = 'idle';
  clearPersistedState();

  renderAll();
}
