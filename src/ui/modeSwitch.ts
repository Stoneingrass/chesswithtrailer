import type { GameController } from '../core';
import { DEFAULT_TRAILER_OPTIONS } from '../core';
import type { NetworkManager } from '../net';
import type { BoardSessionState } from './BoardSessionState';
import { clearPersistedState } from './persist/gameStateStorage';

export function updateModeTabs(
  container: HTMLElement,
  state: BoardSessionState,
  net: NetworkManager,
): void {
  const localTab = container.querySelector<HTMLButtonElement>('.mode-tab[data-mode="local"]');
  const inRoom = state.mode === 'online' && net.getStatus() !== 'disconnected';

  if (localTab) {
    localTab.disabled = inRoom;
    if (inRoom) {
      localTab.title = 'Чтобы перейти в локальный режим, сначала покиньте комнату';
    } else {
      localTab.removeAttribute('title');
    }
  }

  container.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === state.mode);
  });

  const buttonGroup = container.querySelector<HTMLElement>('.button-group');
  if (buttonGroup) {
    buttonGroup.classList.toggle('is-online', state.mode === 'online');
  }
}

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
  if (newMode === 'local' && net.getStatus() !== 'disconnected') {
    return;
  }
  state.mode = newMode;

  updateModeTabs(container, state, net);

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
