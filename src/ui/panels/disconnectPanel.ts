import type { BoardSessionState } from '../BoardSessionState';

export function renderDisconnectPanel(
  container: HTMLElement,
  state: BoardSessionState,
  handlers: {
    onCreateNewRoom: () => void;
  },
): void {
  const disconnectSlot = container.querySelector<HTMLElement>('.disconnect-panel-slot');
  if (!disconnectSlot) return;

  if (state.mode !== 'online' || !state.disconnectReason) {
    disconnectSlot.innerHTML = '';
    disconnectSlot.style.display = 'none';
    return;
  }

  disconnectSlot.style.display = 'block';

  const message =
    state.disconnectReason === 'self'
      ? 'Вы отключились от комнаты'
      : 'Соперник отключился от комнаты';

  disconnectSlot.innerHTML = `
    <div class="disconnect-panel">
      <p class="disconnect-msg">${message}</p>
      <button type="button" class="btn btn-primary btn-sm btn-block create-new-room-btn">Создать новую комнату</button>
    </div>
  `;

  disconnectSlot.querySelector('.create-new-room-btn')?.addEventListener('click', () => {
    handlers.onCreateNewRoom();
  });
}
