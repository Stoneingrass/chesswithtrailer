import type { GameController } from '../../core';
import type { NetworkManager } from '../../net';
import type { BoardSessionState } from '../BoardSessionState';

export function updateGameActionButtons(
  container: HTMLElement,
  state: BoardSessionState,
  game: GameController,
  net: NetworkManager,
): void {
  const actionContainer = container.querySelector<HTMLElement>('.game-action-buttons');
  const rematchContainer = container.querySelector<HTMLElement>('.rematch-action-block');
  const proposalBar = container.querySelector<HTMLElement>('.offer-proposal-bar');
  if (!actionContainer || !proposalBar) return;

  const isOnline = state.mode === 'online';
  if (!isOnline) {
    actionContainer.classList.add('hidden-action-block');
    if (rematchContainer) rematchContainer.classList.add('hidden-action-block');
    proposalBar.classList.add('hidden-action-block');
    return;
  }

  const lastSnap = state.timeline.length > 0 ? state.timeline[state.timeline.length - 1] : null;
  const gameIsOngoing = lastSnap ? lastSnap.result.status === 'ongoing' : game.getResult().status === 'ongoing';
  const isProposalReceived =
    state.takebackState === 'received' ||
    state.drawState === 'received' ||
    state.rematchState === 'received';
  const isResignConfirming = state.resignState === 'confirming';

  if (isProposalReceived || isResignConfirming) {
    actionContainer.classList.add('hidden-action-block');
    if (rematchContainer) rematchContainer.classList.add('hidden-action-block');
    proposalBar.classList.remove('hidden-action-block');

    const textEl = proposalBar.querySelector<HTMLElement>('.proposal-text');
    if (textEl) {
      if (isResignConfirming) {
        textEl.textContent = 'Сдаться?';
      } else if (state.takebackState === 'received') {
        textEl.textContent = 'Возврат хода?';
      } else if (state.drawState === 'received') {
        textEl.textContent = 'Ничья?';
      } else if (state.rematchState === 'received') {
        textEl.textContent = 'Реванш?';
      }
    }
    return;
  }

  proposalBar.classList.add('hidden-action-block');

  if (!gameIsOngoing) {
    actionContainer.classList.add('hidden-action-block');
    if (rematchContainer) {
      rematchContainer.classList.remove('hidden-action-block');
      const rematchBtn = rematchContainer.querySelector<HTMLButtonElement>('.action-rematch');
      if (rematchBtn) {
        const isConnected = net.isConnected();
        rematchBtn.disabled = !isConnected;
        rematchBtn.classList.toggle('is-waiting', state.rematchState === 'offered');
        if (state.rematchState === 'idle') {
          rematchBtn.innerHTML = '<span class="action-label">Реванш</span>';
        } else if (state.rematchState === 'offered') {
          rematchBtn.innerHTML = '<span class="action-label">Ожидание...</span>';
        }
      }
    }
    return;
  }

  if (rematchContainer) rematchContainer.classList.add('hidden-action-block');
  actionContainer.classList.remove('hidden-action-block');

  const isConnected = net.isConnected();
  const hasMoves = state.timeline.length > 1;
  const isDisabled = !isConnected || !gameIsOngoing;

  const currentMoveCount = game.getSnapshot().moveHistory.length;
  let drawCooldownLeft = 0;
  if (state.drawCooldownStartMoveCount !== null) {
    const elapsed = currentMoveCount - state.drawCooldownStartMoveCount;
    if (elapsed < 10) {
      drawCooldownLeft = Math.ceil((10 - elapsed) / 2);
    } else {
      state.drawCooldownStartMoveCount = null;
    }
  }

  const takebackBtn = actionContainer.querySelector<HTMLButtonElement>('.action-takeback');
  const drawBtn = actionContainer.querySelector<HTMLButtonElement>('.action-draw');
  const resignBtn = actionContainer.querySelector<HTMLButtonElement>('.action-resign');

  if (takebackBtn) {
    takebackBtn.disabled = isDisabled || !hasMoves;
    takebackBtn.classList.toggle('is-waiting', state.takebackState === 'offered');
    if (state.takebackState === 'idle') {
      takebackBtn.innerHTML = '<span class="action-label">Ход назад</span>';
    } else if (state.takebackState === 'offered') {
      takebackBtn.innerHTML = '<span class="action-label">Ожидание...</span>';
    }
  }

  if (drawBtn) {
    const drawBtnDisabled = isDisabled || drawCooldownLeft > 0;
    drawBtn.disabled = drawBtnDisabled;
    drawBtn.classList.toggle('is-waiting', state.drawState === 'offered');

    let labelText = 'Ничья';
    if (drawCooldownLeft > 0) {
      labelText = `Ничья (${drawCooldownLeft})`;
      const moveWord = drawCooldownLeft === 1 ? 'ход' : drawCooldownLeft < 5 ? 'хода' : 'ходов';
      drawBtn.title = `Нельзя предлагать ничью ещё ${drawCooldownLeft} ${moveWord}`;
    } else {
      drawBtn.title = 'Предложение ничьей';
      if (state.drawState === 'offered') {
        labelText = 'Ничья...';
      }
    }

    drawBtn.innerHTML = `<span class="action-label">${labelText}</span>`;
  }

  if (resignBtn) {
    resignBtn.disabled = isDisabled;
    resignBtn.innerHTML = '<span class="action-label">Сдаться</span>';
  }
}
