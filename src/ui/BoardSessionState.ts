import type { GameSnapshot, Square } from '../core';

export class BoardSessionState {
  leadingSquare: Square | null = null;
  followerSquares = new Set<Square>();
  legalTargets = new Set<Square>();
  lastMoveSquares = new Set<Square>();

  takebackState: 'idle' | 'offered' | 'received' = 'idle';
  drawState: 'idle' | 'offered' | 'received' = 'idle';
  resignState: 'idle' | 'confirming' = 'idle';
  pendingUndoCount = 1;
  drawCooldownStartMoveCount: number | null = null;

  flipped = false;
  draggedSquare: Square | null = null;
  timeline: GameSnapshot[] = [];
  timelineIndex = 0;
  isBrowsingHistory = false;
  isLastMoveFromDrag = false;

  touchDragFrom: Square | null = null;
  touchDragAvatar: HTMLElement | null = null;
  touchDragStartX = 0;
  touchDragStartY = 0;
  isTouchDragging = false;
  ignoreNextClick = false;

  mode: 'local' | 'online' = 'local';
  netErrorMessage: string | null = null;

  clearSelection(): void {
    this.leadingSquare = null;
    this.followerSquares.clear();
    this.legalTargets.clear();
  }

  resetOffers(): void {
    this.takebackState = 'idle';
    this.drawState = 'idle';
    this.resignState = 'idle';
    this.pendingUndoCount = 1;
  }
}
