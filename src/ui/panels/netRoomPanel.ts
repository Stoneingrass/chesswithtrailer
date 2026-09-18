import type { NetworkManager, RoomSettings } from '../../net';
import type { BoardSessionState } from '../BoardSessionState';

export function renderNetSlot(
  netSlotEl: HTMLElement,
  state: BoardSessionState,
  net: NetworkManager,
  handlers: {
    onCreateRoom: (settings: RoomSettings) => void;
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
        <div class="room-create-options">
          <div class="color-select-row">
            <span class="color-select-label">Цвет:</span>
            <div class="color-selector-group">
              <button type="button" class="color-option-btn ${state.preferredColor === 'w' ? 'active' : ''}" data-color-opt="w" title="Белые">
                <img src="/pieces/wK.svg" alt="Белые" class="color-icon" />
              </button>
              <button type="button" class="color-option-btn ${state.preferredColor === 'b' ? 'active' : ''}" data-color-opt="b" title="Чёрные">
                <img src="/pieces/bK.svg" alt="Чёрные" class="color-icon" />
              </button>
              <button type="button" class="color-option-btn ${state.preferredColor === 'random' ? 'active' : ''}" data-color-opt="random" title="Случайный цвет">
                <img src="/pieces/randomK.svg" alt="Случайный" class="color-icon" />
              </button>
            </div>
          </div>
          <label class="option-item room-opt-label" title="Опции прицепа, выбранные при создании комнаты, нельзя будет изменять до конца игры">
            <input type="checkbox" class="opt-lock-checkbox" ${state.pendingLockOptions ? 'checked' : ''} />
            <span>Блок опций</span>
          </label>
          <label class="option-item room-opt-label">
            <input type="checkbox" class="opt-timer-checkbox" ${state.clockEnabled ? 'checked' : ''} />
            <span>Игра с таймером</span>
          </label>
          <div class="timer-config-box ${state.clockEnabled ? '' : 'hidden-action-block'}">
            <div class="timer-field-row">
              <label>Время (мин):</label>
              <input type="number" class="timer-input-minutes" min="0" step="0.5" value="${state.clockInitialMinutes}" />
            </div>
            <div class="timer-field-row">
              <label>Добавление (сек):</label>
              <input type="number" class="timer-input-increment" min="0" step="1" value="${state.clockIncrementSeconds}" />
            </div>
            <div class="timer-error-msg" style="color: #ef4444; font-size: 0.76rem; margin-top: 0.2rem; display: none;">Таймер 0+0 недопустим.</div>
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-block" data-net-action="create">Создать комнату</button>
        <div class="net-divider">или войти по коду</div>
        <form class="join-form">
          <input type="text" class="room-code-input" placeholder="напр. K9X2P4" maxLength="6" />
          <button type="submit" class="btn btn-secondary">Войти</button>
        </form>
      </div>
    `;

    const lockCheckbox = netSlotEl.querySelector<HTMLInputElement>('.opt-lock-checkbox');
    const timerCheckbox = netSlotEl.querySelector<HTMLInputElement>('.opt-timer-checkbox');
    const timerBox = netSlotEl.querySelector<HTMLElement>('.timer-config-box');
    const timerInputMin = netSlotEl.querySelector<HTMLInputElement>('.timer-input-minutes');
    const timerInputInc = netSlotEl.querySelector<HTMLInputElement>('.timer-input-increment');
    const timerErrorMsg = netSlotEl.querySelector<HTMLElement>('.timer-error-msg');

    netSlotEl.querySelectorAll<HTMLButtonElement>('.color-option-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = (btn.dataset.colorOpt as 'w' | 'b' | 'random') ?? 'random';
        state.preferredColor = val;
        netSlotEl.querySelectorAll<HTMLButtonElement>('.color-option-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.colorOpt === val);
        });
      });
    });

    lockCheckbox?.addEventListener('change', () => {
      state.pendingLockOptions = lockCheckbox.checked;
    });

    timerCheckbox?.addEventListener('change', () => {
      state.clockEnabled = timerCheckbox.checked;
      if (timerBox) {
        timerBox.classList.toggle('hidden-action-block', !timerCheckbox.checked);
      }
    });

    timerInputMin?.addEventListener('input', () => {
      state.clockInitialMinutes = Math.max(0, parseFloat(timerInputMin.value) || 0);
      if (timerErrorMsg) timerErrorMsg.style.display = 'none';
    });

    timerInputInc?.addEventListener('input', () => {
      state.clockIncrementSeconds = Math.max(0, parseFloat(timerInputInc.value) || 0);
      if (timerErrorMsg) timerErrorMsg.style.display = 'none';
    });

    netSlotEl.querySelector('[data-net-action="create"]')?.addEventListener('click', () => {
      const isLocked = lockCheckbox?.checked ?? false;
      const isTimer = timerCheckbox?.checked ?? false;
      const initMin = Math.max(0, parseFloat(timerInputMin?.value || '5') || 0);
      const incSec = Math.max(0, parseFloat(timerInputInc?.value || '3') || 0);

      state.pendingLockOptions = isLocked;
      state.clockEnabled = isTimer;
      state.clockInitialMinutes = initMin;
      state.clockIncrementSeconds = incSec;

      if (isTimer && initMin === 0 && incSec === 0) {
        if (timerErrorMsg) {
          timerErrorMsg.style.display = 'block';
        }
        return;
      }

      const settings: RoomSettings = {
        lockOptions: isLocked,
        clock: {
          enabled: isTimer,
          initialMinutes: initMin,
          incrementSeconds: incSec,
        },
        preferredColor: state.preferredColor,
      };

      handlers.onCreateRoom(settings);
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
          el.textContent = 'Скопировано!';
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
          <div class="online-badge">В сети (ожидание оппонента)</div>
          <p>Код комнаты: <strong class="room-code-display" title="Нажмите, чтобы скопировать код">${roomCode}</strong></p>
          <button type="button" class="btn btn-secondary btn-sm btn-block" data-net-action="copy-link">Скопировать ссылку</button>
          <p class="status-msg">Ожидание подключения второго игрока...</p>
          <button type="button" class="btn btn-link btn-sm" data-net-action="leave">Отмена</button>
        </div>
      </div>
    `;

    bindCopyCodeHandler(roomCode);

    netSlotEl.querySelector('[data-net-action="copy-link"]')?.addEventListener('click', () => {
      void navigator.clipboard.writeText(shareUrl).then(() => {
        const btn = netSlotEl.querySelector<HTMLButtonElement>('[data-net-action="copy-link"]');
        if (btn) btn.textContent = 'Ссылка скопирована!';
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
    const colorText = myColor === 'w' ? 'Белые' : myColor === 'b' ? 'Чёрные' : '?';
    const timeControlText = state.clockEnabled
      ? (state.clockIncrementSeconds > 0
          ? `${state.clockInitialMinutes} мин + ${state.clockIncrementSeconds} сек`
          : `${state.clockInitialMinutes} мин`)
      : 'Без контроля времени';

    netSlotEl.innerHTML = `
      <div class="net-panel">
        <h2>Игра по сети</h2>
        <div class="net-status-box connected">
          <div class="online-badge">В сети</div>
          <p>Комната: <strong class="room-code-display" title="Нажмите, чтобы скопировать код">${roomCode}</strong></p>
          <p>Ваш цвет: <strong>${colorText}</strong></p>
          <p>Контроль времени: <strong>${timeControlText}</strong></p>
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
