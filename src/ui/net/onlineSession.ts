import type { GameController } from '../../core';
import { DEFAULT_TRAILER_OPTIONS } from '../../core';
import type { NetworkManager } from '../../net';
import type { BoardSessionState } from '../BoardSessionState';
import { renderNetSlot } from '../panels/netRoomPanel';
import { updateGameActionButtons } from '../panels/gameActionsPanel';
import { clearPersistedState } from '../persist/gameStateStorage';

export interface OnlineSessionHandlers {
  renderAll: () => void;
  renderHint: () => void;
  refreshOptionsPanel: () => void;
  refreshLegalTargets: () => void;
  applyTakebackUndo: (undoCount: number) => void;
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
    this.net.on('statusChange', (_status, msg) => {
      this.state.netErrorMessage = msg ?? null;
      this.renderNet();
      this.handlers.renderHint();
    });

    this.net.on('partnerConnected', (myColor) => {
      this.state.flipped = myColor === 'b';
      this.handlers.renderAll();
    });

    this.net.on('partnerDisconnected', () => {
      this.handlers.renderHint();
    });

    this.net.on('message', (msg) => {
      if (msg.type === 'INIT_GAME') {
        this.state.drawCooldownStartMoveCount = null;
        this.state.drawState = 'idle';
        this.state.takebackState = 'idle';
        this.state.resignState = 'idle';
        this.state.isBrowsingHistory = true;
        try {
          this.game.loadSnapshot(msg.snapshot);
        } finally {
          this.state.isBrowsingHistory = false;
        }
        this.game.setTrailerOptions(msg.options);
        this.state.timeline = [msg.snapshot];
        this.state.timelineIndex = 0;
        this.handlers.refreshOptionsPanel();
        this.handlers.renderAll();
      } else if (msg.type === 'MOVE') {
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
        this.handlers.renderAll();
      } else if (msg.type === 'CHANGE_OPTIONS') {
        this.game.setTrailerOptions(msg.options);
        this.handlers.refreshOptionsPanel();
        this.handlers.refreshLegalTargets();
        this.handlers.renderAll();
      } else if (msg.type === 'RESET_GAME') {
        this.state.drawCooldownStartMoveCount = null;
        this.state.drawState = 'idle';
        this.state.takebackState = 'idle';
        this.state.resignState = 'idle';
        this.game.setTrailerOptions({ ...DEFAULT_TRAILER_OPTIONS });
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
      }
    });
  }

  async createRoom(): Promise<void> {
    try {
      this.game.reset();
      this.game.setTrailerOptions({ ...DEFAULT_TRAILER_OPTIONS });
      this.state.timeline = [this.game.getSnapshot()];
      this.state.timelineIndex = 0;
      this.state.lastMoveSquares.clear();
      this.state.clearSelection();
      this.state.drawCooldownStartMoveCount = null;
      this.state.drawState = 'idle';
      this.state.takebackState = 'idle';
      this.state.resignState = 'idle';

      clearPersistedState();
      this.handlers.refreshOptionsPanel();
      this.handlers.renderAll();

      await this.net.createRoom(() => ({
        snapshot: this.game.getSnapshot(),
        options: this.game.getTrailerOptions() ?? { ...DEFAULT_TRAILER_OPTIONS },
      }));
      this.renderNet();
    } catch (err) {
      console.error('Failed to create room:', err);
    }
  }

  async joinRoom(code: string): Promise<void> {
    if (!code) return;
    try {
      await this.net.joinRoom(code);
      this.renderNet();
    } catch (err) {
      console.error('Failed to join room:', err);
    }
  }

  renderNet(): void {
    renderNetSlot(this.netSlotEl, this.state, this.net, {
      onCreateRoom: () => void this.createRoom(),
      onJoinRoom: (code) => void this.joinRoom(code),
      onLeaveRoom: () => {
        this.net.disconnect();
        this.renderNet();
      },
    });
  }
}
