import type { NetworkManager } from '../../net';
import type { BoardSessionState } from '../BoardSessionState';

export function renderNetSlot(
  netSlotEl: HTMLElement,
  state: BoardSessionState,
  net: NetworkManager,
  handlers: {
    onCreateRoom: () => void;
    onJoinRoom: (code: string) => void;
    onLeaveRoom: () => void;
  },
): void {
  if (state.mode !== 'online') {
    netSlotEl.innerHTML = '';
    return;
  }

  const netStatus = net.getStatus();
  const roomCode = net.getRoomCode();
  const myColor = net.getMyColor();

  if (netStatus === 'disconnected') {
    netSlotEl.innerHTML = `
      <div class="net-panel">
        <h2>Игра по сети</h2>
        <button type="button" class="btn btn-primary btn-block" data-net-action="create">⚡ Создать комнату</button>
        <div class="net-divider">или войти по коду</div>
        <form class="join-form">
          <input type="text" class="room-code-input" placeholder="напр. K9X2P4" maxLength="6" />
          <button type="submit" class="btn btn-secondary">Войти</button>
        </form>
      </div>
    `;

    netSlotEl.querySelector('[data-net-action="create"]')?.addEventListener('click', () => {
      handlers.onCreateRoom();
    });

    netSlotEl.querySelector('.join-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = netSlotEl.querySelector<HTMLInputElement>('.room-code-input');
      if (input && input.value) {
        handlers.onJoinRoom(input.value);
      }
    });
    return;
  }

  const bindCopyCodeHandler = (code: string | null) => {
    if (!code) return;
    netSlotEl.querySelector('.room-code-display')?.addEventListener('click', () => {
      void navigator.clipboard.writeText(code).then(() => {
        const el = netSlotEl.querySelector<HTMLElement>('.room-code-display');
        if (el) {
          const orig = el.textContent;
          el.textContent = '✓ Скопировано!';
          setTimeout(() => {
            el.textContent = orig;
          }, 1200);
        }
      });
    });
  };

  if (netStatus === 'waiting_for_peer') {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    netSlotEl.innerHTML = `
      <div class="net-panel">
        <h2>Игра по сети</h2>
        <div class="net-status-box waiting">
          <p>Код комнаты: <strong class="room-code-display" title="Нажмите, чтобы скопировать код">${roomCode}</strong></p>
          <button type="button" class="btn btn-secondary btn-sm btn-block" data-net-action="copy-link">📋 Скопировать ссылку</button>
          <p class="status-msg">Ожидание подключения второго игрока...</p>
          <button type="button" class="btn btn-link btn-sm" data-net-action="leave">Отмена</button>
        </div>
      </div>
    `;

    bindCopyCodeHandler(roomCode);

    netSlotEl.querySelector('[data-net-action="copy-link"]')?.addEventListener('click', () => {
      void navigator.clipboard.writeText(shareUrl).then(() => {
        const btn = netSlotEl.querySelector<HTMLButtonElement>('[data-net-action="copy-link"]');
        if (btn) btn.textContent = '✓ Ссылка скопирована!';
      });
    });

    netSlotEl.querySelector('[data-net-action="leave"]')?.addEventListener('click', () => {
      handlers.onLeaveRoom();
    });
    return;
  }

  if (netStatus === 'connecting') {
    netSlotEl.innerHTML = `
      <div class="net-panel">
        <h2>Игра по сети</h2>
        <div class="net-status-box connecting">
          <p class="status-msg">Подключение к комнате <strong class="room-code-display" title="Нажмите, чтобы скопировать код">${roomCode}</strong>...</p>
        </div>
      </div>
    `;
    bindCopyCodeHandler(roomCode);
    return;
  }

  if (netStatus === 'connected') {
    const colorText = myColor === 'w' ? 'Белые (♔)' : 'Чёрные (♚)';
    netSlotEl.innerHTML = `
      <div class="net-panel">
        <h2>Игра по сети</h2>
        <div class="net-status-box connected">
          <div class="online-badge">● В сети</div>
          <p>Комната: <strong class="room-code-display" title="Нажмите, чтобы скопировать код">${roomCode}</strong></p>
          <p>Ваш цвет: <strong>${colorText}</strong></p>
          <button type="button" class="btn btn-secondary btn-sm btn-block" data-net-action="leave">Покинуть комнату</button>
        </div>
      </div>
    `;

    bindCopyCodeHandler(roomCode);

    netSlotEl.querySelector('[data-net-action="leave"]')?.addEventListener('click', () => {
      handlers.onLeaveRoom();
    });
    return;
  }

  if (netStatus === 'error') {
    netSlotEl.innerHTML = `
      <div class="net-panel">
        <h2>Игра по сети</h2>
        <div class="net-status-box error">
          <p class="error-msg">${state.netErrorMessage || 'Ошибка подключения'}</p>
          <button type="button" class="btn btn-secondary btn-sm" data-net-action="leave">Сбросить</button>
        </div>
      </div>
    `;

    netSlotEl.querySelector('[data-net-action="leave"]')?.addEventListener('click', () => {
      handlers.onLeaveRoom();
    });
  }
}
