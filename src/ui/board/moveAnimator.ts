import type { GameController, Move, Piece, Square } from '../../core';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function captureBoardState(game: GameController): Map<Square, Piece> {
  const state = new Map<Square, Piece>();
  const ALL_SQUARES: Square[] = [
    'a1','a2','a3','a4','a5','a6','a7','a8',
    'b1','b2','b3','b4','b5','b6','b7','b8',
    'c1','c2','c3','c4','c5','c6','c7','c8',
    'd1','d2','d3','d4','d5','d6','d7','d8',
    'e1','e2','e3','e4','e5','e6','e7','e8',
    'f1','f2','f3','f4','f5','f6','f7','f8',
    'g1','g2','g3','g4','g5','g6','g7','g8',
    'h1','h2','h3','h4','h5','h6','h7','h8',
  ];
  for (const sq of ALL_SQUARES) {
    const p = game.getPiece(sq);
    if (p) state.set(sq, { type: p.type, color: p.color });
  }
  return state;
}

export function animateShifts(
  boardEl: HTMLElement,
  shifts: Array<{ from: Square; to: Square }>,
  duration = 200,
): void {
  boardEl.querySelectorAll('.moving-piece').forEach((el) => el.remove());
  boardEl.querySelectorAll<HTMLElement>('.piece-img').forEach((img) => (img.style.visibility = 'visible'));

  for (const shift of shifts) {
    if (shift.from === shift.to) continue;
    const fromCell = boardEl.querySelector<HTMLElement>(`[data-square="${shift.from}"]`);
    const toCell = boardEl.querySelector<HTMLElement>(`[data-square="${shift.to}"]`);
    const toPieceImg = toCell?.querySelector<HTMLImageElement>('.piece-img');

    if (!fromCell || !toCell || !toPieceImg) continue;

    const a = fromCell.getBoundingClientRect();
    const b = toCell.getBoundingClientRect();

    toPieceImg.style.visibility = 'hidden';

    const ghost = toPieceImg.cloneNode(true) as HTMLImageElement;
    ghost.className = 'piece-img moving-piece';
    ghost.style.visibility = 'visible';
    Object.assign(ghost.style, {
      left: `${b.left}px`,
      top: `${b.top}px`,
      width: `${b.width}px`,
      height: `${b.height}px`,
    });
    document.body.appendChild(ghost);

    const animation = ghost.animate(
      [
        { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration, easing: 'cubic-bezier(.2,.75,.25,1)' },
    );

    animation.onfinish = () => {
      toPieceImg.style.visibility = 'visible';
      ghost.remove();
    };
  }
}

export function animateGroupMove(
  boardEl: HTMLElement,
  move: Move,
  duration = 220,
): void {
  const shifts = [{ from: move.from, to: move.to }, ...(move.followers ?? [])]
    .filter((shift) => !('removed' in shift && shift.removed))
    .map((s) => ({ from: s.from, to: s.to }));

  if (move.isCastle) {
    const rank = move.from[1];
    const isKingside = move.to[0] === 'g' || move.from === `h${rank}`;
    const rookFrom = (isKingside ? `h${rank}` : `a${rank}`) as Square;
    const rookTo = (isKingside ? `f${rank}` : `d${rank}`) as Square;
    if (!shifts.some((s) => s.from === rookFrom)) {
      shifts.push({ from: rookFrom, to: rookTo });
    }
  }

  animateShifts(boardEl, shifts, duration);
}

export function animateBoardTransition(
  boardEl: HTMLElement,
  oldBoardState: Map<Square, Piece>,
  game: GameController,
  duration = 160,
): void {
  const ALL_SQUARES: Square[] = [
    'a1','a2','a3','a4','a5','a6','a7','a8',
    'b1','b2','b3','b4','b5','b6','b7','b8',
    'c1','c2','c3','c4','c5','c6','c7','c8',
    'd1','d2','d3','d4','d5','d6','d7','d8',
    'e1','e2','e3','e4','e5','e6','e7','e8',
    'f1','f2','f3','f4','f5','f6','f7','f8',
    'g1','g2','g3','g4','g5','g6','g7','g8',
    'h1','h2','h3','h4','h5','h6','h7','h8',
  ];

  const usedOldSquares = new Set<Square>();
  const changedNewSquares: Square[] = [];

  for (const sq of ALL_SQUARES) {
    const newP = game.getPiece(sq);
    const oldP = oldBoardState.get(sq);
    if (newP && oldP && newP.type === oldP.type && newP.color === oldP.color) {
      usedOldSquares.add(sq);
    } else if (newP) {
      changedNewSquares.push(sq);
    }
  }

  const shifts: Array<{ from: Square; to: Square }> = [];

  for (const newSq of changedNewSquares) {
    const newP = game.getPiece(newSq)!;
    let bestOldSq: Square | null = null;
    let minDistance = Infinity;

    for (const [oldSq, oldP] of oldBoardState.entries()) {
      if (usedOldSquares.has(oldSq)) continue;
      if (oldP.type === newP.type && oldP.color === newP.color) {
        const f1 = FILES.indexOf(oldSq[0]), r1 = parseInt(oldSq[1], 10);
        const f2 = FILES.indexOf(newSq[0]), r2 = parseInt(newSq[1], 10);
        const dist = Math.hypot(f1 - f2, r1 - r2);
        if (dist < minDistance) {
          minDistance = dist;
          bestOldSq = oldSq;
        }
      }
    }

    if (bestOldSq) {
      usedOldSquares.add(bestOldSq);
      shifts.push({ from: bestOldSq, to: newSq });
    }
  }

  if (shifts.length > 0) {
    animateShifts(boardEl, shifts, duration);
  }
}
