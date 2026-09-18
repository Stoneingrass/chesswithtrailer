import { DEFAULT_TRAILER_OPTIONS, type GameController } from '../../core';
import type { NetworkManager, RoomSettings } from '../../net';
import type { BoardSessionState } from '../BoardSessionState';
import { renderNetSlot } from '../panels/netRoomPanel';
import { updateGameActionButtons } from '../panels/gameActionsPanel';
import { updateModeTabs } from '../modeSwitch';
import { clearPersistedState } from '../persist/gameStateStorage';

export interface OnlineSessionHandlers {
  renderAll: () => void;
  renderHint: () => void;
  refreshOptionsPanel: () => void;
  refreshLegalTargets: () => void;
  applyTakebackUndo: (undoCount: number) => void;
  startRematchGame: () => void;
  tryExecutePremove?: (arrivalTimestamp: number) => void;
}

export class OnlineSessionManager {
  constructor(
    private container: HTMLElement,
    private netSlotEl: HTMLElement,
    private state: BoardSessionState,
    private game: GameController,
    private net: NetworkManager,
    private handlers: OnlineSessionHandlers,
  ) {}

  setupNetworkEvents(): void {
    this.setupModalListeners();

    this.net.on('statusChange', (_status, msg) => {
      this.state.netErrorMessage = msg ?? null;
      this.renderNet();
      this.handlers.renderHint();
    });

    this.net.on('partnerConnected', (myColor) => {
      this.state.flipped = myColor === 'b';
      this.state.partnerDisconnected = false;
      this.closeNetModal();
      this.handlers.renderAll();
    });

    this.net.on('partnerDisconnected', () => {
      this.state.partnerDisconnected = true;
      this.state.disconnectReason = 'peer';
      this.handlers.renderHint();
      this.handlers.renderAll();
    });

    this.net.on('message', (msg) => {
      if (msg.type === 'INIT_GAME') {
        this.state.drawCooldownStartMoveCount = null;
        this.state.resetOffers();
        this.state.isBrowsingHistory = true;
        try {
          this.game.loadSnapshot(msg.snapshot);
        } finally {
          this.state.isBrowsingHistory = false;
        }
        this.game.setTrailerOptions(msg.options);
        if (msg.roomSettings) {
          this.state.isOptionsLocked = msg.roomSettings.lockOptions;
          this.state.clockEnabled = msg.roomSettings.clock.enabled;
          this.state.clockInitialMinutes = msg.roomSettings.clock.initialMinutes;
          this.state.clockIncrementSeconds = msg.roomSettings.clock.incrementSeconds;
          this.state.whiteTimeMs = msg.roomSettings.clock.initialMinutes * 60 * 1000;
          this.state.blackTimeMs = msg.roomSettings.clock.initialMinutes * 60 * 1000;
          this.state.lastClockTickTimestamp = Date.now();
        } else {
          this.state.isOptionsLocked = false;
          this.state.clockEnabled = false;
        }
        this.state.timeline = [msg.snapshot];
        this.state.timelineIndex = 0;
        this.closeNetModal();
        this.handlers.refreshOptionsPanel();
        this.handlers.renderAll();
      } else if (msg.type === 'MOVE') {
        const arrivalTimestamp = Date.now();
        if (msg.whiteTimeMs !== undefined) this.state.whiteTimeMs = msg.whiteTimeMs;
        if (msg.blackTimeMs !== undefined) this.state.blackTimeMs = msg.blackTimeMs;
        this.state.lastClockTickTimestamp = arrivalTimestamp;
        this.state.isBrowsingHistory = true;
        try {
          this.game.loadSnapshot(msg.snapshot);
        } finally {
          this.state.isBrowsingHistory = false;
        }
        this.state.timeline.push(msg.snapshot);
        this.state.timelineIndex = this.state.timeline.length - 1;
        this.state.lastMoveSquares = new Set([msg.move.from, msg.move.to]);
        for (const f of msg.move.followers ?? []) {
          this.state.lastMoveSquares.add(f.from);
          this.state.lastMoveSquares.add(f.to);
        }
        this.handlers.tryExecutePremove?.(arrivalTimestamp);
        this.handlers.renderAll();
      } else if (msg.type === 'CHANGE_OPTIONS') {
        if (!this.state.isOptionsLocked) {
          this.game.setTrailerOptions(msg.options);
          this.handlers.refreshOptionsPanel();
          this.handlers.refreshLegalTargets();
          this.handlers.renderAll();
        }
      } else if (msg.type === 'RESET_GAME') {
        this.state.drawCooldownStartMoveCount = null;
        this.state.resetOffers();
        this.state.isBrowsingHistory = true;
        try {
          this.game.loadSnapshot(msg.snapshot);
        } finally {
          this.state.isBrowsingHistory = false;
        }
        this.state.timeline = [msg.snapshot];
        this.state.timelineIndex = 0;
        this.state.clearSelection();
        this.handlers.refreshOptionsPanel();
        this.handlers.renderAll();
      } else if (msg.type === 'ERROR') {
        this.state.netErrorMessage = msg.message;
        this.renderNet();
      } else if (msg.type === 'TAKEBACK_OFFER') {
        if (msg.fromColor !== this.net.getMyColor()) {
          this.state.takebackState = 'received';
          this.state.pendingUndoCount = msg.undoCount;
          updateGameActionButtons(this.container, this.state, this.game, this.net);
        }
      } else if (msg.type === 'TAKEBACK_ACCEPT') {
        this.handlers.applyTakebackUndo(msg.undoCount);
      } else if (msg.type === 'TAKEBACK_CANCEL') {
        this.state.takebackState = 'idle';
        updateGameActionButtons(this.container, this.state, this.game, this.net);
      } else if (msg.type === 'DRAW_OFFER') {
        if (msg.fromColor !== this.net.getMyColor()) {
          this.state.drawState = 'received';
          updateGameActionButtons(this.container, this.state, this.game, this.net);
        }
      } else if (msg.type === 'DRAW_ACCEPT') {
        this.game.agreeDraw();
        this.state.drawState = 'idle';
        this.handlers.renderAll();
      } else if (msg.type === 'DRAW_REJECT') {
        this.state.drawState = 'idle';
        this.state.drawCooldownStartMoveCount = this.game.getSnapshot().moveHistory.length;
        updateGameActionButtons(this.container, this.state, this.game, this.net);
      } else if (msg.type === 'DRAW_CANCEL') {
        this.state.drawState = 'idle';
        updateGameActionButtons(this.container, this.state, this.game, this.net);
      } else if (msg.type === 'RESIGN') {
        this.game.resign(msg.fromColor);
        this.state.resignState = 'idle';
        this.handlers.renderAll();
      } else if (msg.type === 'REMATCH_OFFER') {
        if (msg.fromColor !== this.net.getMyColor()) {
          this.state.rematchState = 'received';
          updateGameActionButtons(this.container, this.state, this.game, this.net);
        }
      } else if (msg.type === 'REMATCH_ACCEPT') {
        this.handlers.startRematchGame();
      } else if (msg.type === 'REMATCH_REJECT') {
        this.state.rematchState = 'idle';
        updateGameActionButtons(this.container, this.state, this.game, this.net);
      } else if (msg.type === 'REMATCH_CANCEL') {
        this.state.rematchState = 'idle';
        updateGameActionButtons(this.container, this.state, this.game, this.net);
      } else if (msg.type === 'TIMEOUT') {
        if (this.game.getResult().status === 'ongoing') {
          this.game.timeout(msg.winner);
          this.handlers.renderAll();
        }
      }
    });
  }

  openNetModal(): void {
    const modalOverlay = this.container.querySelector('.net-room-modal-overlay');
    if (modalOverlay) {
      modalOverlay.classList.remove('hidden');
    }
  }

  closeNetModal(): void {
    const modalOverlay = this.container.querySelector('.net-room-modal-overlay');
    if (modalOverlay) {
      modalOverlay.classList.add('hidden');
    }
  }

  private setupModalListeners(): void {
    const modalOverlay = this.container.querySelector<HTMLElement>('.net-room-modal-overlay');
    const closeBtn = this.container.querySelector<HTMLButtonElement>('.net-room-close-btn');

    closeBtn?.addEventListener('click', () => {
      this.closeNetModal();
    });

    modalOverlay?.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        this.closeNetModal();
      }
    });
  }

  async createRoom(settings?: RoomSettings): Promise<void> {
    try {
      this.state.disconnectReason = null;
      this.state.partnerDisconnected = false;
      this.state.flipped = settings?.preferredColor === 'b';
      this.state.isOptionsLocked = settings?.lockOptions ?? false;
      this.state.clockEnabled = settings?.clock.enabled ?? false;
      this.state.clockInitialMinutes = settings?.clock.initialMinutes ?? 5;
      this.state.clockIncrementSeconds = settings?.clock.incrementSeconds ?? 3;
      this.state.whiteTimeMs = (settings?.clock.initialMinutes ?? 5) * 60 * 1000;
      this.state.blackTimeMs = (settings?.clock.initialMinutes ?? 5) * 60 * 1000;
      this.state.lastClockTickTimestamp = Date.now();

      this.game.reset();
      this.state.timeline = [this.game.getSnapshot()];
      this.state.timelineIndex = 0;
      this.state.lastMoveSquares.clear();
      this.state.clearSelection();
      this.state.drawCooldownStartMoveCount = null;
      this.state.resetOffers();

      clearPersistedState();
      this.handlers.refreshOptionsPanel();
      this.handlers.renderAll();

      await this.net.createRoom(() => ({
        snapshot: this.game.getSnapshot(),
        options: this.game.getTrailerOptions() ?? { ...DEFAULT_TRAILER_OPTIONS },
        roomSettings: settings,
      }));
      this.renderNet();
    } catch (err) {
      console.error('Failed to create room:', err);
    }
  }

  async joinRoom(code: string): Promise<void> {
    if (!code) return;
    try {
      this.state.disconnectReason = null;
      this.state.partnerDisconnected = false;
      await this.net.joinRoom(code);
      this.renderNet();
    } catch (err) {
      console.error('Failed to join room:', err);
    }
  }

  renderNet(): void {
    updateModeTabs(this.container, this.state, this.net);
    renderNetSlot(this.netSlotEl, this.state, this.net, {
      onCreateRoom: (settings) => void this.createRoom(settings),
      onJoinRoom: (code) => void this.joinRoom(code),
      onLeaveRoom: () => {
        this.state.disconnectReason = 'self';
        this.net.disconnect();
        this.state.isOptionsLocked = false;
        this.state.clockEnabled = false;
        this.handlers.refreshOptionsPanel();
        this.renderNet();
        this.handlers.renderAll();
      },
    });

    const connectedSlot = this.container.querySelector<HTMLElement>('.net-room-connected-slot');
    if (connectedSlot) {
      const netStatus = this.net.getStatus();
      if (this.state.mode === 'online' && netStatus !== 'disconnected') {
        const roomCode = this.net.getRoomCode();
        const myColor = this.net.getMyColor();
        const colorText = myColor === 'w' ? 'Белые' : myColor === 'b' ? 'Чёрные' : '?';
        const badgeText = netStatus === 'waiting_for_peer' ? 'В сети (ожидание оппонента)' : 'В сети';
        const timeControlText = this.state.clockEnabled
          ? (this.state.clockIncrementSeconds > 0
              ? `${this.state.clockInitialMinutes} мин + ${this.state.clockIncrementSeconds} сек`
              : `${this.state.clockInitialMinutes} мин`)
          : 'Без контроля времени';

        connectedSlot.innerHTML = `
          <div class="net-panel connected-info">
            <h2>Сессионная комната</h2>
            <div class="net-status-box connected">
              <div class="online-badge">${badgeText}</div>
              <p>Комната: <strong>${roomCode}</strong></p>
              <p>Ваш цвет: <strong>${colorText}</strong></p>
              <p>Контроль времени: <strong>${timeControlText}</strong></p>
              <button type="button" class="btn btn-secondary btn-sm btn-block" data-net-action="leave">Покинуть комнату</button>
            </div>
          </div>
        `;
        connectedSlot.querySelector('[data-net-action="leave"]')?.addEventListener('click', () => {
          this.state.disconnectReason = 'self';
          this.net.disconnect();
          this.state.isOptionsLocked = false;
          this.state.clockEnabled = false;
          this.handlers.refreshOptionsPanel();
          this.renderNet();
          this.handlers.renderAll();
        });
      } else {
        connectedSlot.innerHTML = '';
      }
    }
  }
}
