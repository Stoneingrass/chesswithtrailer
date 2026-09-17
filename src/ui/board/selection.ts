import type { GameController, Square } from '../../core';
import type { BoardSessionState } from '../BoardSessionState';

export function getSelectableFollowers(
  state: BoardSessionState,
  game: GameController,
): Square[] {
  if (!state.leadingSquare) return [];
  const opts = game.getTrailerOptions();
  const associated = game.getCastlingAssociatedSquares(state.leadingSquare);
  const rootSquares = [state.leadingSquare, ...associated];

  const direct = new Set<Square>();
  for (const root of rootSquares) {
    for (const p of game.getDirectProtectors(root)) {
      if (!opts?.kingCannotBeFollower || game.getPiece(p)?.type !== 'k') {
        direct.add(p);
      }
    }
  }

  if (!opts?.allowRecursiveGroup || !opts?.allowMultiFollower) {
    return [...direct];
  }

  const selectable = new Set<Square>(direct);
  for (const follower of state.followerSquares) {
    for (const p of game.getDirectProtectors(follower)) {
      if (
        !rootSquares.includes(p) &&
        (!opts?.kingCannotBeFollower || game.getPiece(p)?.type !== 'k')
      ) {
        selectable.add(p);
      }
    }
  }
  return [...selectable];
}

export function getProtectionDepths(
  leadingSq: Square,
  game: GameController,
): Map<Square, number> {
  const depths = new Map<Square, number>();
  const opts = game.getTrailerOptions();
  if (!opts) return depths;

  const associated = game.getCastlingAssociatedSquares(leadingSq);
  const rootSquares = [leadingSq, ...associated];

  const queue: Array<{ square: Square; depth: number }> = rootSquares.map((sq) => ({
    square: sq,
    depth: 0,
  }));
  const visited = new Set<Square>(rootSquares);

  while (queue.length > 0) {
    const { square: curr, depth: currDepth } = queue.shift()!;
    const protectors = game.getDirectProtectors(curr);

    for (const p of protectors) {
      if (visited.has(p)) continue;
      if (opts.kingCannotBeFollower && game.getPiece(p)?.type === 'k') continue;

      visited.add(p);
      const d = currDepth + 1;
      depths.set(p, d);

      if (opts.allowRecursiveGroup && opts.allowMultiFollower) {
        queue.push({ square: p, depth: d });
      }
    }
  }

  return depths;
}

export function pruneDisconnectedFollowers(
  state: BoardSessionState,
  game: GameController,
): void {
  if (!state.leadingSquare || state.followerSquares.size === 0) return;

  const associated = game.getCastlingAssociatedSquares(state.leadingSquare);
  const reachable = new Set<Square>([state.leadingSquare, ...associated]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const follower of Array.from(state.followerSquares)) {
      if (!reachable.has(follower)) {
        for (const targetSq of Array.from(reachable)) {
          const protectors = game.getDirectProtectors(targetSq);
          if (protectors.includes(follower)) {
            reachable.add(follower);
            changed = true;
            break;
          }
        }
      }
    }
  }

  for (const follower of Array.from(state.followerSquares)) {
    if (!reachable.has(follower)) {
      state.followerSquares.delete(follower);
    }
  }
}
