import type { GameController } from '../../core';
import type { BoardSessionState } from '../BoardSessionState';

const SAVE_KEY = 'omnichess-saved-game-state';

export function savePersistedState(game: GameController, state: BoardSessionState): void {
  try {
    if (game.getResult().status !== 'ongoing') {
      clearPersistedState();
      return;
    }
    const data = {
      snapshot: game.getSnapshot(),
      timeline: state.timeline,
      timelineIndex: state.timelineIndex,
      options: game.getTrailerOptions(),
      lastMoveSquares: Array.from(state.lastMoveSquares),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save persisted state:', e);
  }
}

export function loadPersistedState(game: GameController, state: BoardSessionState): boolean {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data && data.snapshot && Array.isArray(data.timeline) && data.timeline.length > 0) {
      if (data.options) {
        game.setTrailerOptions(data.options);
      }
      state.timeline = data.timeline;
      state.timelineIndex = Math.max(
        0,
        Math.min(data.timelineIndex ?? data.timeline.length - 1, data.timeline.length - 1),
      );
      state.isBrowsingHistory = true;
      try {
        game.loadSnapshot(state.timeline[state.timelineIndex]);
      } finally {
        state.isBrowsingHistory = false;
      }
      if (Array.isArray(data.lastMoveSquares)) {
        state.lastMoveSquares = new Set(data.lastMoveSquares);
      }
      return true;
    }
  } catch (e) {
    console.error('Failed to load persisted state:', e);
  }
  return false;
}

export function clearPersistedState(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {}
}
