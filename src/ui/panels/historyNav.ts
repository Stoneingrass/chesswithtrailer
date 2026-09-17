import type { GameSnapshot } from '../../core';

export function renderHistoryNav(
  container: HTMLElement,
  timeline: GameSnapshot[],
  timelineIndex: number,
  updateGameActionButtons: () => void,
): void {
  const isAtStart = timelineIndex === 0;
  const isAtEnd = timelineIndex === timeline.length - 1;

  const btnStart = container.querySelector<HTMLButtonElement>('[data-nav="start"]');
  const btnBack = container.querySelector<HTMLButtonElement>('[data-nav="back"]');
  const btnForward = container.querySelector<HTMLButtonElement>('[data-nav="forward"]');
  const btnEnd = container.querySelector<HTMLButtonElement>('[data-nav="end"]');

  if (btnStart) btnStart.disabled = isAtStart;
  if (btnBack) btnBack.disabled = isAtStart;
  if (btnForward) btnForward.disabled = isAtEnd;
  if (btnEnd) btnEnd.disabled = isAtEnd;

  const latestSnapshot = timeline[timeline.length - 1];
  const gameIsOngoing = latestSnapshot ? latestSnapshot.result.status === 'ongoing' : true;
  const isBrowsingPast = !isAtEnd;
  const shouldPulse = isBrowsingPast && gameIsOngoing;

  if (btnEnd) {
    btnEnd.classList.toggle('pulse', shouldPulse);
  }

  updateGameActionButtons();
}
