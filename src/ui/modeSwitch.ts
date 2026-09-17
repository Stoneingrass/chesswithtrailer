import type { GameController } from '../core';
import type { NetworkManager } from '../net';
import type { BoardSessionState } from './BoardSessionState';

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

  state.clearSelection();
  renderAll();
}
