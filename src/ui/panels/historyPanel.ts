import type { GameSnapshot } from '../../core';

export function renderHistory(
  historyEl: HTMLElement,
  timeline: GameSnapshot[],
  timelineIndex: number,
): void {
  const latestSnapshot = timeline[timeline.length - 1];
  const fullMoves = latestSnapshot?.moveHistory ?? [];
  historyEl.innerHTML = '';

  for (let i = 0; i < fullMoves.length; i += 2) {
    const li = document.createElement('li');
    const moveNum = Math.floor(i / 2) + 1;
    const whiteSnap = i + 1;
    const blackSnap = i + 2;

    const whiteSan = fullMoves[i]?.san ?? '';
    const blackSan = fullMoves[i + 1]?.san ?? '';

    const isWhiteActive = timelineIndex === whiteSnap;
    const isBlackActive = timelineIndex === blackSnap;

    let html = `<span class="move-num">${moveNum}.</span>`;
    html += ` <span class="move-san ${isWhiteActive ? 'active' : ''}" data-snapshot="${whiteSnap}">${whiteSan}</span>`;
    if (fullMoves[i + 1]) {
      html += ` <span class="move-san ${isBlackActive ? 'active' : ''}" data-snapshot="${blackSan}">${blackSan}</span>`;
    }
    li.innerHTML = html;
    historyEl.appendChild(li);
  }

  const activeSpan = historyEl.querySelector<HTMLElement>('.move-san.active');
  if (activeSpan) {
    const container = historyEl;
    const itemTop = activeSpan.offsetTop - container.offsetTop;
    const itemBottom = itemTop + activeSpan.offsetHeight;
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;

    if (itemTop < containerTop) {
      container.scrollTop = itemTop;
    } else if (itemBottom > containerBottom) {
      container.scrollTop = itemBottom - container.clientHeight;
    }
  }
}
