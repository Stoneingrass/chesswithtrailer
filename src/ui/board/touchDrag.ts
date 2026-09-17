import type { GameController, Square } from '../../core';
import type { BoardSessionState } from '../BoardSessionState';
import { createPieceImg } from '../pieceAssets';

export class TouchDragManager {
  constructor(
    private boardEl: HTMLElement,
    private state: BoardSessionState,
    private game: GameController,
    private isMyTurn: () => boolean,
    private selectLeading: (sq: Square) => void,
    private attemptMove: (from: Square, to: Square) => Promise<void>,
  ) {}

  onPointerDown(e: PointerEvent, square: Square): void {
    if (e.button !== 0) return;
    if (this.state.timelineIndex !== this.state.timeline.length - 1) return;
    if (!this.isMyTurn()) return;
    if (this.game.getResult().status !== 'ongoing') return;
    const piece = this.game.getPiece(square);
    if (!piece || piece.color !== this.game.getTurn()) return;

    this.state.touchDragFrom = square;
    this.state.touchDragStartX = e.clientX;
    this.state.touchDragStartY = e.clientY;
    this.state.isTouchDragging = false;

    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.state.touchDragFrom) return;
    const dx = e.clientX - this.state.touchDragStartX;
    const dy = e.clientY - this.state.touchDragStartY;

    if (!this.state.isTouchDragging && Math.hypot(dx, dy) > 7) {
      this.state.isTouchDragging = true;
      if (this.state.touchDragFrom && this.state.leadingSquare !== this.state.touchDragFrom) {
        this.selectLeading(this.state.touchDragFrom);
      }
      this.createTouchDragAvatar(this.state.touchDragFrom, e.clientX, e.clientY);
    }

    if (this.state.isTouchDragging && this.state.touchDragAvatar) {
      if (e.cancelable) e.preventDefault();

      const leadingCell = this.boardEl.querySelector<HTMLElement>(
        `[data-square="${this.state.touchDragFrom}"]`,
      );
      const tileSize = leadingCell?.getBoundingClientRect().width || 50;

      this.state.touchDragAvatar.style.left = `${e.clientX - tileSize / 2}px`;
      this.state.touchDragAvatar.style.top = `${e.clientY - tileSize / 2}px`;

      const elem = document.elementFromPoint(e.clientX, e.clientY);
      const targetCell = elem?.closest<HTMLElement>('.square');
      const targetSquare = targetCell?.dataset.square as Square | undefined;

      this.boardEl.querySelectorAll('.drag-over').forEach((c) => c.classList.remove('drag-over'));
      if (targetSquare && targetSquare !== this.state.touchDragFrom) {
        const context =
          this.state.leadingSquare === this.state.touchDragFrom &&
          this.state.followerSquares.size > 0
            ? { followers: [...this.state.followerSquares] }
            : undefined;
        const allowed = this.game
          .getLegalMoves(this.state.touchDragFrom, context)
          .some((m) => m.to === targetSquare);
        if (allowed && targetCell) {
          targetCell.classList.add('drag-over');
        }
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);

    if (this.state.isTouchDragging) {
      this.state.ignoreNextClick = true;
      if (this.state.touchDragAvatar) {
        this.state.touchDragAvatar.remove();
        this.state.touchDragAvatar = null;
      }
      this.boardEl.querySelectorAll('.drag-over').forEach((c) => c.classList.remove('drag-over'));

      const elem = document.elementFromPoint(e.clientX, e.clientY);
      const targetCell = elem?.closest<HTMLElement>('.square');
      const toSquare = targetCell?.dataset.square as Square | undefined;

      const fromSquare = this.state.touchDragFrom;
      this.state.touchDragFrom = null;
      this.state.isTouchDragging = false;

      if (fromSquare && toSquare && fromSquare !== toSquare) {
        const context =
          this.state.leadingSquare === fromSquare && this.state.followerSquares.size > 0
            ? { followers: [...this.state.followerSquares] }
            : undefined;
        const allowed = this.game
          .getLegalMoves(fromSquare, context)
          .some((m) => m.to === toSquare);
        if (allowed) {
          this.state.isLastMoveFromDrag = true;
          void this.attemptMove(fromSquare, toSquare);
        }
      }
    } else {
      this.state.touchDragFrom = null;
      this.state.isTouchDragging = false;
    }
  };

  private createTouchDragAvatar(leadingSq: Square, clientX: number, clientY: number): void {
    if (this.state.touchDragAvatar) {
      this.state.touchDragAvatar.remove();
      this.state.touchDragAvatar = null;
    }

    const leadingCell = this.boardEl.querySelector<HTMLElement>(`[data-square="${leadingSq}"]`);
    if (!leadingCell) return;
    const leadingRect = leadingCell.getBoundingClientRect();
    const tileSize = leadingRect.width;

    const followerSqs =
      this.state.leadingSquare === leadingSq ? this.state.followerSquares : new Set<Square>();
    const group = [leadingSq, ...followerSqs];

    const container = document.createElement('div');
    container.className = 'touch-drag-avatar';
    Object.assign(container.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '10000',
      left: `${clientX - tileSize / 2}px`,
      top: `${clientY - tileSize / 2}px`,
      opacity: '0.88',
      filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.55))',
    });

    for (const sq of group) {
      const p = this.game.getPiece(sq);
      if (!p) continue;
      const cell = this.boardEl.querySelector<HTMLElement>(`[data-square="${sq}"]`);
      if (!cell) continue;
      const rect = cell.getBoundingClientRect();

      const relX = rect.left - leadingRect.left;
      const relY = rect.top - leadingRect.top;

      const img = createPieceImg(p.color, p.type);
      Object.assign(img.style, {
        position: 'absolute',
        left: `${relX}px`,
        top: `${relY}px`,
        width: `${tileSize}px`,
        height: `${tileSize}px`,
      });
      container.appendChild(img);
    }

    document.body.appendChild(container);
    this.state.touchDragAvatar = container;
  }
}
