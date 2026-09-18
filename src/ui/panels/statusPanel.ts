import type { GameController, GameResult } from '../../core';
import { createPieceImg } from '../pieceAssets';

export function resultMessage(result: GameResult): string {
  switch (result.status) {
    case 'ongoing':
      return '';
    case 'checkmate':
      return `Мат! Победили ${result.winner === 'w' ? 'белые' : 'чёрные'}.`;
    case 'stalemate':
      return 'Пат — ничья.';
    case 'draw':
      return `Ничья (${result.reason === 'agreement' ? 'соглашение' : result.reason}).`;
    case 'resigned':
      return `${result.winner === 'w' ? 'Чёрные' : 'Белые'} сдались. Победили ${result.winner === 'w' ? 'белые' : 'чёрные'}.`;
  }
}

export function renderStatus(
  container: HTMLElement,
  statusEl: HTMLElement,
  game: GameController,
): void {
  const turnEl = container.querySelector('.turn-indicator');
  if (!turnEl) return;

  const turn = game.getTurn();
  const result = game.getResult();
  const inCheck = game.isInCheck();

  if (result.status === 'ongoing') {
    const turnImg = createPieceImg(turn, 'k');
    turnImg.classList.add('turn-badge-img');
    turnEl.innerHTML = '';
    turnEl.appendChild(turnImg);
    const text = document.createElement('span');
    text.innerHTML = `Ход ${turn === 'w' ? 'белых' : 'чёрных'}${inCheck ? ' · <strong>Шах!</strong>' : ''}`;
    turnEl.appendChild(text);
  } else {
    turnEl.innerHTML = '';
  }

  const msg = resultMessage(result);
  statusEl.textContent = msg;
  statusEl.className = `game-status ${result.status !== 'ongoing' ? 'game-over' : ''}`;
}
