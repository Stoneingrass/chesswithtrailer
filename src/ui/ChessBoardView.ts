import type { GameController, PieceType, Square, TrailerOptions } from '../core';
import { DEFAULT_TRAILER_OPTIONS } from '../core';
import { NetworkManager } from '../net';
import { BoardSessionState } from './BoardSessionState';
import { getGameLayoutHtml } from './layout/gameLayout';
import { initHelpModal } from './help/helpModal';

import { renderOptionsPanel } from './panels/trailerOptionsPanel';
import { renderStatus } from './panels/statusPanel';
import { renderHistory } from './panels/historyPanel';
import { renderHistoryNav } from './panels/historyNav';
import { updateGameActionButtons } from './panels/gameActionsPanel';

import { renderBoard } from './board/renderBoard';
import { getSelectableFollowers, getProtectionDepths, pruneDisconnectedFollowers } from './board/selection';
import { DragDropManager } from './board/dragDrop';
import { TouchDragManager } from './board/touchDrag';
import { showPromotionDialog } from './board/promotionDialog';
import { animateBoardTransition, animateGroupMove, captureBoardState } from './board/moveAnimator';

import { OnlineSessionManager } from './net/onlineSession';
import { clearPersistedState, savePersistedState } from './persist/gameStateStorage';
import { switchMode, updateModeTabs } from './modeSwitch';

export class ChessBoardView {
  private state = new BoardSessionState();
  private net = new NetworkManager();

  private boardEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private historyEl!: HTMLElement;
  private promotionEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private optionsSlotEl!: HTMLElement;
  private netSlotEl!: HTMLElement;
  private headerSubEl!: HTMLElement;

  private dragDropMgr!: DragDropManager;
  private touchDragMgr!: TouchDragManager;
  private onlineSessionMgr!: OnlineSessionManager;

  constructor(
    private container: HTMLElement,
    private game: GameController,
  ) {}

  mount(): void {
    const initialOptionsHtml = renderOptionsPanel(this.game.getTrailerOptions());
    this.container.innerHTML = getGameLayoutHtml(this.game.getRuleSetName(), initialOptionsHtml);

    initHelpModal(this.container);

    window.addEventListener('contextmenu', () => {
      this.cancelPendingActions();
    });

    this.boardEl = this.container.querySelector('.board')!;
    this.statusEl = this.container.querySelector('.game-status')!;
    this.historyEl = this.container.querySelector('.move-history')!;
    this.promotionEl = this.container.querySelector('.promotion-dialog')!;
    this.hintEl = this.container.querySelector('.selection-hint')!;
    this.optionsSlotEl = this.container.querySelector('.trailer-options-slot')!;
    this.netSlotEl = this.container.querySelector('.net-room-slot')!;
    this.headerSubEl = this.container.querySelector('.game-subtitle')!;

    clearPersistedState();
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

    this.dragDropMgr = new DragDropManager(
      this.boardEl,
      this.state,
      this.game,
      () => this.isMyTurn(),
      (sq) => this.selectLeading(sq),
      (from, to) => this.attemptMove(from, to),
    );

    this.touchDragMgr = new TouchDragManager(
      this.boardEl,
      this.state,
      this.game,
      () => this.isMyTurn(),
      (sq) => this.selectLeading(sq),
      (from, to) => this.attemptMove(from, to),
    );

    this.onlineSessionMgr = new OnlineSessionManager(
      this.container,
      this.netSlotEl,
      this.state,
      this.game,
      this.net,
      {
        renderAll: () => this.render(),
        renderHint: () => this.renderHint(),
        refreshOptionsPanel: () => this.refreshOptionsPanel(),
        refreshLegalTargets: () => this.refreshLegalTargets(),
        applyTakebackUndo: (count) => this.applyTakebackUndo(count),
        startRematchGame: () => this.startRematchGame(),
      },
    );

    this.setupModeTabs();
    this.onlineSessionMgr.setupNetworkEvents();

    this.container.querySelector('[data-action="reset"]')!.addEventListener('click', () => {
      if (this.state.mode === 'online') return;
      this.cancelPendingActions();
      this.state.drawCooldownStartMoveCount = null;
      this.state.resetOffers();
      this.game.reset();
      this.game.setTrailerOptions({ ...DEFAULT_TRAILER_OPTIONS });
      this.state.timeline = [this.game.getSnapshot()];
      this.state.timelineIndex = 0;
      this.state.lastMoveSquares.clear();
      this.state.clearSelection();
      clearPersistedState();
      this.refreshOptionsPanel();
      this.render();
    });

    this.container.querySelector('[data-action="flip"]')!.addEventListener('click', () => {
      this.cancelPendingActions();
      this.state.flipped = !this.state.flipped;
      this.render();
    });

    this.container.querySelector('[data-action="takeback"]')?.addEventListener('click', () => {
      this.handleTakebackClick();
    });
    this.container.querySelector('[data-action="draw"]')?.addEventListener('click', () => {
      this.handleDrawClick();
    });
    this.container.querySelector('[data-action="resign"]')?.addEventListener('click', () => {
      this.handleResignClick();
    });
    this.container.querySelector('[data-action="rematch"]')?.addEventListener('click', () => {
      this.handleRematchClick();
    });
    this.container.querySelector('[data-action="proposal-accept"]')?.addEventListener('click', () => {
      this.handleProposalAcceptClick();
    });
    this.container.querySelector('[data-action="proposal-reject"]')?.addEventListener('click', () => {
      this.handleProposalRejectClick();
    });

    this.historyEl.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.move-san');
      if (!target) return;
      const snapIdx = parseInt(target.dataset.snapshot ?? '', 10);
      if (!isNaN(snapIdx)) {
        this.showTimeline(snapIdx);
      }
    });

    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable) {
        return;
      }
      const helpOverlay = this.container.querySelector('.help-modal-overlay');
      if ((helpOverlay && !helpOverlay.classList.contains('hidden')) || !this.promotionEl.classList.contains('hidden')) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.showTimeline(this.state.timelineIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.showTimeline(this.state.timelineIndex + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.showTimeline(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.showTimeline(this.state.timeline.length - 1);
      }
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((button) => {
      button.addEventListener('click', () => {
        const nav = button.dataset.nav;
        const target =
          nav === 'start'
            ? 0
            : nav === 'back'
              ? this.state.timelineIndex - 1
              : nav === 'forward'
                ? this.state.timelineIndex + 1
                : this.state.timeline.length - 1;
        this.showTimeline(target);
      });
    });

    this.bindOptionsPanel();

    this.game.subscribe((event) => {
      if (event.type === 'move') {
        if (this.state.timelineIndex === this.state.timeline.length - 1) this.state.timeline.push(event.snapshot);
        this.state.timelineIndex = this.state.timeline.length - 1;
        this.state.lastMoveSquares = new Set([event.move.from, event.move.to]);
        for (const f of event.move.followers ?? []) {
          this.state.lastMoveSquares.add(f.from);
          this.state.lastMoveSquares.add(f.to);
        }
        savePersistedState(this.game, this.state);
      }
      if (event.type === 'reset') {
        this.state.drawCooldownStartMoveCount = null;
        this.state.lastMoveSquares.clear();
        this.state.clearSelection();
        if (!this.state.isBrowsingHistory) {
          this.state.timeline = [event.snapshot];
          this.state.timelineIndex = 0;
        }
      }
      if (event.type === 'undo') {
        this.state.clearSelection();
      }
      if (event.type === 'gameOver') {
        if (this.state.timeline.length > 0) {
          this.state.timeline[this.state.timeline.length - 1] = this.game.getSnapshot();
        }
      }
      this.render();
    });

    // Auto-join room if room query parameter is present in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      switchMode('online', this.container, this.headerSubEl, this.state, this.game, this.net, () => this.render());
      void this.onlineSessionMgr.joinRoom(roomParam);
    } else {
      this.render();
    }
  }

  private setupModeTabs(): void {
    this.container.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode as 'local' | 'online';
        if (mode === 'local' && this.state.mode === 'online' && this.net.getStatus() !== 'disconnected') {
          return;
        }
        switchMode(mode, this.container, this.headerSubEl, this.state, this.game, this.net, () => this.render());
      });
    });
  }

  private render(): void {
    updateModeTabs(this.container, this.state, this.net);
    this.onlineSessionMgr.renderNet();
    renderBoard(this.boardEl, this.state, this.game, {
      onDragStart: (e, sq) => this.dragDropMgr.onDragStart(e, sq),
      onDragOver: (e, sq) => this.dragDropMgr.onDragOver(e, sq),
      onDrop: (e, sq) => this.dragDropMgr.onDrop(e, sq),
      clearDragState: () => this.dragDropMgr.clearDragState(),
      onPointerDown: (e, sq) => this.touchDragMgr.onPointerDown(e, sq),
      onSquareClick: (sq) => this.onSquareClick(sq),
      clearSelection: () => this.clearSelection(),
    });
    renderStatus(this.container, this.statusEl, this.game);
    renderHistory(this.historyEl, this.state.timeline, this.state.timelineIndex);
    this.renderHint();
    renderHistoryNav(this.container, this.state.timeline, this.state.timelineIndex, () =>
      updateGameActionButtons(this.container, this.state, this.game, this.net),
    );
  }

  private bindOptionsPanel(): void {
    this.container.querySelectorAll<HTMLInputElement>('input[data-opt]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.opt as keyof TrailerOptions;
        const change: Partial<TrailerOptions> = { [key]: input.checked };
        if (key === 'allowMultiFollower' && !input.checked) {
          change.allowRecursiveGroup = false;
        }
        if (key === 'allowFollowerCaptureWithoutLeadingCapture' && !input.checked) {
          change.allowGroupCapture = false;
          change.allowFollowerFriendlyCapture = false;
        }
        this.game.setTrailerOptions(change);
        if (this.state.mode === 'online' && this.net.isConnected()) {
          this.net.sendMessage({ type: 'CHANGE_OPTIONS', options: change });
        }
        savePersistedState(this.game, this.state);
        this.refreshOptionsPanel();
        this.refreshLegalTargets();
        this.render();
      });
    });

    this.optionsSlotEl.querySelector('.reset-options-btn')?.addEventListener('click', () => {
      this.game.setTrailerOptions({ ...DEFAULT_TRAILER_OPTIONS });
      if (this.state.mode === 'online' && this.net.isConnected()) {
        this.net.sendMessage({ type: 'CHANGE_OPTIONS', options: { ...DEFAULT_TRAILER_OPTIONS } });
      }
      savePersistedState(this.game, this.state);
      this.refreshOptionsPanel();
      this.refreshLegalTargets();
      this.render();
    });
  }

  private refreshOptionsPanel(): void {
    this.optionsSlotEl.innerHTML = renderOptionsPanel(this.game.getTrailerOptions());
    this.bindOptionsPanel();
  }

  private isMyTurn(): boolean {
    if (this.state.mode === 'local') return true;
    if (!this.net.isConnected()) return false;
    return this.game.getTurn() === this.net.getMyColor();
  }

  private onSquareClick(square: Square): void {
    if (this.state.ignoreNextClick) {
      this.state.ignoreNextClick = false;
      return;
    }
    if (this.state.timelineIndex !== this.state.timeline.length - 1) return;
    if (!this.isMyTurn()) return;
    const result = this.game.getResult();
    if (result.status !== 'ongoing') return;

    const piece = this.game.getPiece(square);
    const turn = this.game.getTurn();

    if (this.state.leadingSquare) {
      if (this.state.legalTargets.has(square)) {
        void this.attemptMove(this.state.leadingSquare, square);
        return;
      }

      if (this.state.followerSquares.has(square)) {
        this.toggleFollower(square);
        return;
      }

      if (piece && piece.color === turn && square !== this.state.leadingSquare) {
        const selectable = getSelectableFollowers(this.state, this.game);
        if (selectable.includes(square)) {
          this.toggleFollower(square);
          return;
        }

        const depths = getProtectionDepths(this.state.leadingSquare, this.game);
        if (depths.has(square)) {
          return;
        }

        this.selectLeading(square);
        return;
      }

      if (square === this.state.leadingSquare) {
        this.clearSelection();
        return;
      }

      this.clearSelection();
      return;
    }

    if (piece && piece.color === turn) {
      this.selectLeading(square);
    }
  }

  private toggleFollower(square: Square): void {
    const opts = this.game.getTrailerOptions();
    if (this.state.followerSquares.has(square)) {
      this.state.followerSquares.delete(square);
      pruneDisconnectedFollowers(this.state, this.game);
    } else {
      if (!opts?.allowMultiFollower) {
        this.state.followerSquares.clear();
      }
      this.state.followerSquares.add(square);
      pruneDisconnectedFollowers(this.state, this.game);
    }
    this.refreshLegalTargets();
    this.render();
  }

  private selectLeading(square: Square): void {
    this.state.leadingSquare = square;
    this.state.followerSquares.clear();
    this.refreshLegalTargets();
    this.render();
  }

  private refreshLegalTargets(): void {
    if (!this.state.leadingSquare) {
      this.state.legalTargets.clear();
      return;
    }
    const context =
      this.state.followerSquares.size > 0 ? { followers: [...this.state.followerSquares] } : undefined;
    this.state.legalTargets = new Set(
      this.game.getLegalMoves(this.state.leadingSquare, context).map((m) => m.to),
    );
  }

  private clearSelection(): void {
    this.state.clearSelection();
    renderBoard(this.boardEl, this.state, this.game, {
      onDragStart: (e, sq) => this.dragDropMgr.onDragStart(e, sq),
      onDragOver: (e, sq) => this.dragDropMgr.onDragOver(e, sq),
      onDrop: (e, sq) => this.dragDropMgr.onDrop(e, sq),
      clearDragState: () => this.dragDropMgr.clearDragState(),
      onPointerDown: (e, sq) => this.touchDragMgr.onPointerDown(e, sq),
      onSquareClick: (sq) => this.onSquareClick(sq),
      clearSelection: () => this.clearSelection(),
    });
    this.renderHint();
  }

  private renderHint(): void {
    const result = this.game.getResult();
    if (result.status !== 'ongoing') {
      this.hintEl.textContent = '';
      return;
    }

    if (this.state.mode === 'online') {
      if (!this.net.isConnected()) {
        this.hintEl.textContent = 'Ожидание подключения соперника по сети...';
        return;
      }
      if (this.game.getTurn() !== this.net.getMyColor()) {
        this.hintEl.textContent = 'Ожидание хода соперника...';
        return;
      }
    }

    if (!this.state.leadingSquare) {
      this.hintEl.textContent = 'Выберите ведущую фигуру. Затем — необязательно — ведомую (защитника).';
      return;
    }

    const selectable = getSelectableFollowers(this.state, this.game);
    if (this.state.followerSquares.size === 0) {
      this.hintEl.textContent =
        selectable.length > 0
          ? `Ведущая: ${this.state.leadingSquare}. Можно добавить ведомую (${selectable.join(', ')}).`
          : `Ведущая: ${this.state.leadingSquare}. Нет доступных ведомых — обычный ход.`;
    } else {
      this.hintEl.textContent = `Ведущая: ${this.state.leadingSquare}, ведомые: ${[...this.state.followerSquares].join(', ')}.`;
    }
  }

  private async attemptMove(from: Square, to: Square): Promise<void> {
    const promotingPawns: Array<{ from: Square; to: Square; isLeading: boolean }> = [];
    const turn = this.game.getTurn();

    const leadingPiece = this.game.getPiece(from);
    if (leadingPiece && leadingPiece.type === 'p') {
      const lastRank = leadingPiece.color === 'w' ? '8' : '1';
      if (to[1] === lastRank) {
        promotingPawns.push({ from, to, isLeading: true });
      }
    }

    const { df, dr } = this.getDelta(from, to);
    for (const fSq of this.state.followerSquares) {
      const fPiece = this.game.getPiece(fSq);
      if (fPiece && fPiece.type === 'p') {
        const fTo = this.addDelta(fSq, df, dr);
        if (fTo !== null) {
          const lastRank = fPiece.color === 'w' ? '8' : '1';
          if (fTo[1] === lastRank) {
            promotingPawns.push({ from: fSq, to: fTo, isLeading: false });
          }
        }
      }
    }

    let leadingPromotion: PieceType | undefined = undefined;
    const followerPromotions: Partial<Record<Square, PieceType>> = {};

    if (promotingPawns.length > 0) {
      for (const p of promotingPawns) {
        const label = p.isLeading
          ? `Превращение ведущей пешки (${p.from} → ${p.to})`
          : `Превращение ведомой пешки (${p.from} → ${p.to})`;

        const choice = await showPromotionDialog(this.promotionEl, turn, label);
        if (!choice) {
          this.clearSelection();
          return;
        }

        if (p.isLeading) {
          leadingPromotion = choice;
        } else {
          followerPromotions[p.from] = choice;
        }
      }
    }

    const context =
      this.state.followerSquares.size > 0
        ? {
            followers: [...this.state.followerSquares],
            followerPromotions:
              Object.keys(followerPromotions).length > 0 ? followerPromotions : undefined,
          }
        : undefined;

    this.executeMove(from, to, leadingPromotion, context);
  }

  private executeMove(
    from: Square,
    to: Square,
    promotion?: PieceType,
    context?: { followers: Square[]; followerPromotions?: Partial<Record<Square, PieceType>> },
  ): void {
    const wasDrag = this.state.isLastMoveFromDrag;
    this.state.isLastMoveFromDrag = false;

    const result = this.game.tryMove(from, to, promotion, context);
    this.state.leadingSquare = null;
    this.state.followerSquares.clear();
    this.state.legalTargets.clear();
    if (!result.ok) {
      console.warn(result.reason);
    } else {
      savePersistedState(this.game, this.state);
      if (this.state.mode === 'online' && this.net.isConnected()) {
        this.net.sendMessage({ type: 'MOVE', move: result.move, snapshot: result.snapshot });
      }
    }
    this.render();
    if (result.ok && !wasDrag) {
      animateGroupMove(this.boardEl, result.move, 220);
    }
  }

  private showTimeline(index: number): void {
    const next = Math.max(0, Math.min(index, this.state.timeline.length - 1));
    if (next === this.state.timelineIndex) return;

    const oldBoardState = captureBoardState(this.game);

    this.state.timelineIndex = next;
    this.state.isBrowsingHistory = true;
    try {
      this.game.loadSnapshot(this.state.timeline[next]);
    } finally {
      this.state.isBrowsingHistory = false;
    }
    this.clearSelection();

    const snap = this.state.timeline[next];
    if (next > 0 && snap && snap.moveHistory.length > 0) {
      const lastMove = snap.moveHistory[snap.moveHistory.length - 1];
      this.state.lastMoveSquares = new Set([lastMove.from, lastMove.to]);
      for (const f of lastMove.followers ?? []) {
        this.state.lastMoveSquares.add(f.from);
        this.state.lastMoveSquares.add(f.to);
      }
    } else {
      this.state.lastMoveSquares.clear();
    }

    this.render();
    animateBoardTransition(this.boardEl, oldBoardState, this.game, 160);
  }

  public startRematchGame(): void {
    const newColor = this.net.swapColor();
    if (newColor) {
      this.state.flipped = newColor === 'b';
    }
    this.game.reset();
    this.state.timeline = [this.game.getSnapshot()];
    this.state.timelineIndex = 0;
    this.state.lastMoveSquares.clear();
    this.state.clearSelection();
    this.state.drawCooldownStartMoveCount = null;
    this.state.resetOffers();
    clearPersistedState();
    this.render();
  }

  private cancelPendingActions(sendNet = true): void {
    let changed = false;
    if (this.state.takebackState === 'offered') {
      if (sendNet && this.state.mode === 'online' && this.net.isConnected()) {
        this.net.sendMessage({ type: 'TAKEBACK_CANCEL' });
      }
      this.state.takebackState = 'idle';
      changed = true;
    }
    if (this.state.drawState === 'offered') {
      if (sendNet && this.state.mode === 'online' && this.net.isConnected()) {
        this.net.sendMessage({ type: 'DRAW_CANCEL' });
      }
      this.state.drawState = 'idle';
      changed = true;
    }
    if (this.state.resignState !== 'idle') {
      this.state.resignState = 'idle';
      changed = true;
    }
    if (this.state.rematchState === 'offered') {
      if (sendNet && this.state.mode === 'online' && this.net.isConnected()) {
        this.net.sendMessage({ type: 'REMATCH_CANCEL' });
      }
      this.state.rematchState = 'idle';
      changed = true;
    }
    if (changed) {
      updateGameActionButtons(this.container, this.state, this.game, this.net);
    }
  }

  private applyTakebackUndo(undoCount: number): void {
    const validCount = Math.min(undoCount, Math.max(1, this.state.timeline.length - 1));
    this.game.undo(validCount);
    this.state.timeline = this.state.timeline.slice(0, Math.max(1, this.state.timeline.length - validCount));
    this.state.timelineIndex = this.state.timeline.length - 1;
    const targetSnapshot = this.state.timeline[this.state.timelineIndex];

    this.state.isBrowsingHistory = true;
    try {
      this.game.loadSnapshot(targetSnapshot);
    } finally {
      this.state.isBrowsingHistory = false;
    }

    this.updateLastMoveFromTimeline();
    this.state.takebackState = 'idle';
    this.clearSelection();
    savePersistedState(this.game, this.state);
    this.render();
  }

  private updateLastMoveFromTimeline(): void {
    const currentSnap = this.state.timeline[this.state.timelineIndex];
    if (currentSnap && currentSnap.moveHistory.length > 0) {
      const lastMove = currentSnap.moveHistory[currentSnap.moveHistory.length - 1];
      this.state.lastMoveSquares = new Set([lastMove.from, lastMove.to]);
      for (const f of lastMove.followers ?? []) {
        this.state.lastMoveSquares.add(f.from);
        this.state.lastMoveSquares.add(f.to);
      }
    } else {
      this.state.lastMoveSquares.clear();
    }
  }

  private handleTakebackClick(): void {
    if (this.state.mode !== 'online' || !this.net.isConnected()) return;
    if (this.game.getResult().status !== 'ongoing') return;
    if (this.state.timeline.length <= 1) return;

    if (this.state.takebackState === 'idle') {
      this.cancelPendingActions(true);
      this.state.takebackState = 'offered';
      const myColor = this.net.getMyColor() ?? (this.state.flipped ? 'b' : 'w');
      const currentTurn = this.game.getTurn();
      const rawUndoCount = currentTurn === myColor ? 2 : 1;
      const undoCount = Math.min(rawUndoCount, Math.max(1, this.state.timeline.length - 1));
      this.state.pendingUndoCount = undoCount;
      this.net.sendMessage({ type: 'TAKEBACK_OFFER', fromColor: myColor, undoCount });
      updateGameActionButtons(this.container, this.state, this.game, this.net);
    } else if (this.state.takebackState === 'offered') {
      this.state.takebackState = 'idle';
      this.net.sendMessage({ type: 'TAKEBACK_CANCEL' });
      updateGameActionButtons(this.container, this.state, this.game, this.net);
    } else if (this.state.takebackState === 'received') {
      const undoCount = Math.min(this.state.pendingUndoCount, Math.max(1, this.state.timeline.length - 1));
      this.applyTakebackUndo(undoCount);
      this.net.sendMessage({ type: 'TAKEBACK_ACCEPT', undoCount });
    }
  }

  private handleDrawClick(): void {
    if (this.state.mode !== 'online' || !this.net.isConnected()) return;
    if (this.game.getResult().status !== 'ongoing') return;

    const currentMoveCount = this.game.getSnapshot().moveHistory.length;
    if (this.state.drawCooldownStartMoveCount !== null) {
      const elapsed = currentMoveCount - this.state.drawCooldownStartMoveCount;
      if (elapsed < 10) return;
      this.state.drawCooldownStartMoveCount = null;
    }

    if (this.state.drawState === 'idle') {
      this.cancelPendingActions(true);
      this.state.drawState = 'offered';
      const myColor = this.net.getMyColor() ?? (this.state.flipped ? 'b' : 'w');
      this.net.sendMessage({ type: 'DRAW_OFFER', fromColor: myColor });
      updateGameActionButtons(this.container, this.state, this.game, this.net);
    } else if (this.state.drawState === 'offered') {
      this.state.drawState = 'idle';
      this.net.sendMessage({ type: 'DRAW_CANCEL' });
      updateGameActionButtons(this.container, this.state, this.game, this.net);
    }
  }

  private handleRematchClick(): void {
    if (this.state.mode !== 'online' || !this.net.isConnected()) return;
    if (this.game.getResult().status === 'ongoing') return;

    if (this.state.rematchState === 'idle') {
      this.cancelPendingActions(true);
      this.state.rematchState = 'offered';
      const myColor = this.net.getMyColor() ?? (this.state.flipped ? 'b' : 'w');
      this.net.sendMessage({ type: 'REMATCH_OFFER', fromColor: myColor });
      updateGameActionButtons(this.container, this.state, this.game, this.net);
    } else if (this.state.rematchState === 'offered') {
      this.state.rematchState = 'idle';
      this.net.sendMessage({ type: 'REMATCH_CANCEL' });
      updateGameActionButtons(this.container, this.state, this.game, this.net);
    }
  }

  private handleProposalAcceptClick(): void {
    if (this.state.mode !== 'online' || !this.net.isConnected()) return;
    if (this.game.getResult().status !== 'ongoing' && this.state.rematchState !== 'received') return;

    if (this.state.resignState === 'confirming') {
      const myColor = this.net.getMyColor() ?? (this.state.flipped ? 'b' : 'w');
      this.game.resign(myColor);
      this.state.resignState = 'idle';
      this.net.sendMessage({ type: 'RESIGN', fromColor: myColor });
      this.render();
    } else if (this.state.takebackState === 'received') {
      const undoCount = Math.min(this.state.pendingUndoCount, Math.max(1, this.state.timeline.length - 1));
      this.applyTakebackUndo(undoCount);
      this.net.sendMessage({ type: 'TAKEBACK_ACCEPT', undoCount });
    } else if (this.state.drawState === 'received') {
      this.game.agreeDraw();
      this.state.drawState = 'idle';
      this.net.sendMessage({ type: 'DRAW_ACCEPT' });
      this.render();
    } else if (this.state.rematchState === 'received') {
      this.net.sendMessage({ type: 'REMATCH_ACCEPT' });
      this.startRematchGame();
    }
  }

  private handleProposalRejectClick(): void {
    if (this.state.mode !== 'online' || !this.net.isConnected()) return;

    if (this.state.resignState === 'confirming') {
      this.state.resignState = 'idle';
      updateGameActionButtons(this.container, this.state, this.game, this.net);
    } else if (this.state.takebackState === 'received') {
      this.state.takebackState = 'idle';
      this.net.sendMessage({ type: 'TAKEBACK_CANCEL' });
      updateGameActionButtons(this.container, this.state, this.game, this.net);
    } else if (this.state.drawState === 'received') {
      this.state.drawState = 'idle';
      this.net.sendMessage({ type: 'DRAW_REJECT' });
      updateGameActionButtons(this.container, this.state, this.game, this.net);
    } else if (this.state.rematchState === 'received') {
      this.state.rematchState = 'idle';
      this.net.sendMessage({ type: 'REMATCH_REJECT' });
      updateGameActionButtons(this.container, this.state, this.game, this.net);
    }
  }

  private handleResignClick(): void {
    if (this.state.mode !== 'online' || !this.net.isConnected()) return;
    if (this.game.getResult().status !== 'ongoing') return;

    if (this.state.resignState === 'idle') {
      this.cancelPendingActions(true);
      this.state.resignState = 'confirming';
      updateGameActionButtons(this.container, this.state, this.game, this.net);
    }
  }

  private getDelta(from: Square, to: Square): { df: number; dr: number } {
    const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const f1 = FILES.indexOf(from[0]), r1 = parseInt(from[1], 10);
    const f2 = FILES.indexOf(to[0]), r2 = parseInt(to[1], 10);
    return { df: f2 - f1, dr: r2 - r1 };
  }

  private addDelta(from: Square, df: number, dr: number): Square | null {
    const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const fIdx = FILES.indexOf(from[0]) + df;
    const rIdx = parseInt(from[1], 10) + dr;
    if (fIdx < 0 || fIdx > 7 || rIdx < 1 || rIdx > 8) return null;
    return `${FILES[fIdx]}${rIdx}` as Square;
  }
}
