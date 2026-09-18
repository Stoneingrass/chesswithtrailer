import type { Color, GameController } from '../../core';
import type { BoardSessionState } from '../BoardSessionState';

export function formatClockTime(timeMs: number): string {
  if (timeMs <= 0) return '00:00';
  if (timeMs > 20000) {
    const totalSeconds = Math.ceil(timeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const padM = String(minutes).padStart(2, '0');
    const padS = String(seconds).padStart(2, '0');
    return `${padM}:${padS}`;
  } else {
    const totalTenths = Math.max(0, Math.floor(timeMs / 100));
    const seconds = Math.floor(totalTenths / 10);
    const tenths = totalTenths % 10;
    const padS = String(seconds).padStart(2, '0');
    return `${padS}.${tenths}`;
  }
}

export function renderClockSlot(
  container: HTMLElement,
  state: BoardSessionState,
  game: GameController,
): void {
  const topSlot = container.querySelector<HTMLElement>('.clock-top-slot');
  const bottomSlot = container.querySelector<HTMLElement>('.clock-bottom-slot');

  if (!topSlot || !bottomSlot) return;

  if (!state.clockEnabled || state.mode !== 'online') {
    topSlot.innerHTML = '';
    bottomSlot.innerHTML = '';
    topSlot.style.display = 'none';
    bottomSlot.style.display = 'none';
    return;
  }

  topSlot.style.display = 'block';
  bottomSlot.style.display = 'block';

  const turn = game.getTurn();
  const gameIsOngoing = game.getResult().status === 'ongoing';

  // Map top and bottom colors based on board orientation
  const topColor: Color = state.flipped ? 'w' : 'b';
  const bottomColor: Color = state.flipped ? 'b' : 'w';

  const topTimeMs = topColor === 'w' ? state.whiteTimeMs : state.blackTimeMs;
  const bottomTimeMs = bottomColor === 'w' ? state.whiteTimeMs : state.blackTimeMs;

  const isTopActive = gameIsOngoing && turn === topColor;
  const isBottomActive = gameIsOngoing && turn === bottomColor;

  const isTopLowTime = topTimeMs <= 20000;
  const isBottomLowTime = bottomTimeMs <= 20000;

  const topLabel = `Соперник (${topColor === 'w' ? 'Белые' : 'Чёрные'})`;
  const bottomLabel = `Вы (${bottomColor === 'w' ? 'Белые' : 'Чёрные'})`;

  topSlot.innerHTML = `
    <div class="chess-clock-card ${isTopActive ? 'is-active' : ''} ${isTopLowTime ? 'is-low-time' : ''}">
      <div class="clock-card-header">
        <span class="clock-card-label">${topLabel}</span>
        ${isTopActive ? '<span class="clock-card-status">Ход</span>' : ''}
      </div>
      <span class="clock-display">${formatClockTime(topTimeMs)}</span>
      <div class="clock-active-bar"></div>
    </div>
  `;

  bottomSlot.innerHTML = `
    <div class="chess-clock-card ${isBottomActive ? 'is-active' : ''} ${isBottomLowTime ? 'is-low-time' : ''}">
      <div class="clock-card-header">
        <span class="clock-card-label">${bottomLabel}</span>
        ${isBottomActive ? '<span class="clock-card-status">Ход</span>' : ''}
      </div>
      <span class="clock-display">${formatClockTime(bottomTimeMs)}</span>
      <div class="clock-active-bar"></div>
    </div>
  `;
}
