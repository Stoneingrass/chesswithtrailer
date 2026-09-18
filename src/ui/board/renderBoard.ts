import type { GameController, Piece, Square } from '../../core';
import { addDelta, getDelta } from '../../core';
import type { BoardSessionState } from '../BoardSessionState';
import { createPieceImg } from '../pieceAssets';
import { getProtectionDepths } from './selection';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export interface RenderBoardHandlers {
  onDragStart: (event: DragEvent, square: Square) => void;
  onDragOver: (event: DragEvent, square: Square) => void;
  onDrop: (event: DragEvent, square: Square) => void;
  clearDragState: () => void;
  onPointerDown: (event: PointerEvent, square: Square) => void;
  onSquareClick: (square: Square) => void;
  clearSelection: () => void;
}

export function renderBoard(
  boardEl: HTMLElement,
  state: BoardSessionState,
  game: GameController,
  handlers: RenderBoardHandlers,
): void {
  boardEl.innerHTML = '';
  const displayFiles = state.flipped ? [...FILES].reverse() : FILES;
  const displayRanks = state.flipped ? [...RANKS].reverse() : RANKS;

  const boardContainer = boardEl.closest('.board-container');
  if (boardContainer) {
    const coordsBottom = boardContainer.querySelector('.coords-bottom');
    const coordsRight = boardContainer.querySelector('.coords-right');
    if (coordsBottom) {
      coordsBottom.innerHTML = displayFiles.map((f) => `<span>${f}</span>`).join('');
    }
    if (coordsRight) {
      coordsRight.innerHTML = displayRanks.map((r) => `<span>${r}</span>`).join('');
    }
  }

  const protectionDepths = state.leadingSquare
    ? getProtectionDepths(state.leadingSquare, game)
    : new Map<Square, number>();

  const ghostPositions = new Map<Square, { piece: Piece; isLeading: boolean }>();
  const premoveOrigins = new Set<Square>();

  if (state.premove) {
    const { from, to, followers } = state.premove;
    premoveOrigins.add(from);
    const leadingPiece = game.getPiece(from);
    if (leadingPiece) {
      ghostPositions.set(to, { piece: leadingPiece, isLeading: true });
    }

    const { df, dr } = getDelta(from, to);
    for (const fSq of followers) {
      premoveOrigins.add(fSq);
      const fPiece = game.getPiece(fSq);
      const fTo = addDelta(fSq, df, dr);
      if (fPiece && fTo) {
        ghostPositions.set(fTo, { piece: fPiece, isLeading: false });
      }
    }
  }

  for (const rank of displayRanks) {
    for (const file of displayFiles) {
      const square = `${file}${rank}` as Square;
      const fileIdx = FILES.indexOf(file);
      const rankIdx = parseInt(rank, 10);
      const isLight = (fileIdx + rankIdx) % 2 === 0;

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'square';
      cell.dataset.square = square;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', square);
      cell.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        handlers.clearSelection();
      });

      if (isLight) cell.classList.add('light');
      else cell.classList.add('dark');

      if (state.leadingSquare === square) cell.classList.add('selected');
      if (state.followerSquares.has(square)) cell.classList.add('follower-selected');
      if (state.legalTargets.has(square)) cell.classList.add('target');
      if (state.lastMoveSquares.has(square)) cell.classList.add('last-move');

      if (premoveOrigins.has(square)) {
        cell.classList.add('is-premove-from');
      }
      if (state.premove && state.premove.to === square) {
        cell.classList.add('is-premove-to');
      }

      if (
        state.leadingSquare &&
        protectionDepths.has(square) &&
        square !== state.leadingSquare &&
        !state.followerSquares.has(square)
      ) {
        cell.classList.add('chain-marker');
        const rawD = protectionDepths.get(square)!;
        const d = Math.min(rawD, 4);
        cell.classList.add(`chain-depth-${d}`);
      }

      if (ghostPositions.has(square)) {
        const { piece } = ghostPositions.get(square)!;
        const image = createPieceImg(piece.color, piece.type);
        image.classList.add('is-premove-ghost');
        cell.appendChild(image);
      } else if (premoveOrigins.has(square)) {
        // Piece has moved away in premove ghost preview
      } else {
        const piece = game.getPiece(square);
        if (piece) {
          const image = createPieceImg(piece.color, piece.type);
          image.draggable = true;
          image.addEventListener('dragstart', (event) => handlers.onDragStart(event, square));
          image.addEventListener('dragend', () => handlers.clearDragState());
          cell.appendChild(image);
        }
      }

      cell.addEventListener('dragover', (event) => handlers.onDragOver(event, square));
      cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
      cell.addEventListener('drop', (event) => handlers.onDrop(event, square));

      cell.addEventListener('pointerdown', (event) => handlers.onPointerDown(event, square));
      cell.addEventListener('click', () => handlers.onSquareClick(square));

      boardEl.appendChild(cell);
    }
  }
}
