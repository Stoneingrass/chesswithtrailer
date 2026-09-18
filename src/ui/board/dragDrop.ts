import type { Color, GameController, Square } from '../../core';
import type { BoardSessionState } from '../BoardSessionState';
import { createPieceImg } from '../pieceAssets';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export class DragDropManager {
  constructor(
    private boardEl: HTMLElement,
    private state: BoardSessionState,
    private game: GameController,
    private isMyTurn: () => boolean,
    private selectLeading: (sq: Square) => void,
    private attemptMove: (from: Square, to: Square) => Promise<void>,
    private getMyColor: () => Color | null,
  ) {}

  createDragPreview(event: DragEvent, leadingSq: Square, followerSqs: Set<Square>): void {
    if (!event.dataTransfer) return;

    const group = [leadingSq, ...followerSqs];
    const files = group.map((sq) => FILES.indexOf(sq[0]));
    const ranks = group.map((sq) => parseInt(sq[1], 10));

    const minFile = Math.min(...files);
    const maxFile = Math.max(...files);
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);

    const leadingCell = this.boardEl.querySelector<HTMLElement>(`[data-square="${leadingSq}"]`);
    const tileSize = leadingCell?.getBoundingClientRect().width || 60;

    const container = document.createElement('div');
    container.className = 'drag-preview-container';
    Object.assign(container.style, {
      position: 'absolute',
      top: '-9999px',
      left: '-9999px',
      width: `${(maxFile - minFile + 1) * tileSize}px`,
      height: `${(maxRank - minRank + 1) * tileSize}px`,
      pointerEvents: 'none',
      zIndex: '9999',
    });

    for (const sq of group) {
      const p = this.game.getPiece(sq);
      if (!p) continue;
      const fIdx = FILES.indexOf(sq[0]);
      const rIdx = parseInt(sq[1], 10);

      const relX = (fIdx - minFile) * tileSize;
      const relY = (maxRank - rIdx) * tileSize;

      const img = createPieceImg(p.color, p.type);
      Object.assign(img.style, {
        position: 'absolute',
        left: `${relX}px`,
        top: `${relY}px`,
        width: `${tileSize}px`,
        height: `${tileSize}px`,
        opacity: '0.85',
      });
      container.appendChild(img);
    }

    document.body.appendChild(container);

    const leadingFIdx = FILES.indexOf(leadingSq[0]);
    const leadingRIdx = parseInt(leadingSq[1], 10);
    const offsetX = (leadingFIdx - minFile) * tileSize + tileSize / 2;
    const offsetY = (maxRank - leadingRIdx) * tileSize + tileSize / 2;

    event.dataTransfer.setDragImage(container, offsetX, offsetY);
    setTimeout(() => container.remove(), 0);
  }

  onDragStart(event: DragEvent, square: Square): void {
    if (this.state.timelineIndex !== this.state.timeline.length - 1) {
      event.preventDefault();
      return;
    }
    const piece = this.game.getPiece(square);
    if (!piece) {
      event.preventDefault();
      return;
    }
    const myColor = this.getMyColor();
    const activeColor = this.isMyTurn()
      ? this.game.getTurn()
      : this.state.mode === 'online'
        ? myColor
        : null;
    if (piece.color !== activeColor) {
      event.preventDefault();
      return;
    }
    this.state.draggedSquare = square;
    event.dataTransfer?.setData('text/plain', square);
    event.dataTransfer!.effectAllowed = 'move';

    if (this.state.leadingSquare !== square) {
      this.selectLeading(square);
    }

    if (this.state.leadingSquare === square && this.state.followerSquares.size > 0) {
      this.createDragPreview(event, this.state.leadingSquare, this.state.followerSquares);
    }
  }

  onDragOver(event: DragEvent, square: Square): void {
    const from = this.state.draggedSquare;
    if (!from || from === square) return;
    const isOnlinePremove = this.state.mode === 'online' && !this.isMyTurn();
    if (!this.isMyTurn() && !isOnlinePremove) return;

    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    (event.currentTarget as HTMLElement).classList.add('drag-over');
  }

  onDrop(event: DragEvent, to: Square): void {
    event.preventDefault();
    const from = this.state.draggedSquare;
    this.clearDragState();
    if (!from || from === to) return;

    if (!this.isMyTurn()) {
      if (this.state.mode === 'online') {
        const myColor = this.getMyColor();
        const followers =
          this.state.leadingSquare === from ? [...this.state.followerSquares] : [];
        const context = followers.length > 0 ? { followers } : undefined;
        const allowed = myColor
          ? this.game.getLegalMoves(from, context, myColor).some((m) => m.to === to)
          : false;
        if (allowed) {
          this.state.premove = { from, to, followers };
          this.selectLeading(from);
        }
      }
      return;
    }

    const context =
      this.state.leadingSquare === from && this.state.followerSquares.size > 0
        ? { followers: [...this.state.followerSquares] }
        : undefined;
    if (!this.game.getLegalMoves(from, context).some((move) => move.to === to)) return;
    this.state.isLastMoveFromDrag = true;
    void this.attemptMove(from, to);
  }

  clearDragState(): void {
    this.state.draggedSquare = null;
    this.boardEl
      ?.querySelectorAll('.drag-over')
      .forEach((cell) => cell.classList.remove('drag-over'));
  }
}
