import type { Piece, PieceType, Square, MoveContext } from '../types';
export type { MoveContext };

/** Опциональные правила варианта «шахматы с прицепом». */
export interface TrailerOptions {
  /** 1. Ведомая может пересекать занятые клетки (кроме случая, когда ведущая — конь) */
  allowPassThrough: boolean;
  /** 2. Группа из 3+ фигур (несколько ведомых) */
  allowMultiFollower: boolean;
  /** 3. Рекурсивное присоединение защитников ведомых */
  allowRecursiveGroup: boolean;
  /** 4. Группа может брать несколько фигур противника */
  allowGroupCapture: boolean;
  /** Ведомые могут брать, когда ведущая не совершает взятие. */
  allowFollowerCaptureWithoutLeadingCapture: boolean;
  /** Ведомая может убрать фигуру своего цвета с клетки назначения. */
  allowFollowerFriendlyCapture: boolean;
  /** Король не может быть ведомой фигурой. */
  kingCannotBeFollower: boolean;
  /** 5. Ведомая за границей доски исчезает вместо отмены хода */
  followerOffBoardRemoved: boolean;
  /** Основная опция: Запрет на перепрыгивание "прицепом" за конём */
  disallowKnightFollowerJumping: boolean;
  /** Дополнительная опция: Конь с прицепом также не может перепрыгивать */
  disallowKnightTrailerJumping: boolean;
}

export const DEFAULT_TRAILER_OPTIONS: TrailerOptions = {
  allowPassThrough: false,
  allowMultiFollower: false,
  allowRecursiveGroup: false,
  allowGroupCapture: false,
  allowFollowerCaptureWithoutLeadingCapture: false,
  allowFollowerFriendlyCapture: false,
  kingCannotBeFollower: false,
  followerOffBoardRemoved: false,
  disallowKnightFollowerJumping: false,
  disallowKnightTrailerJumping: false,
};

export const TRAILER_OPTIONS_STORAGE_KEY = 'omnichess-trailer-options';

export function loadTrailerOptions(): TrailerOptions {
  try {
    const raw = localStorage.getItem(TRAILER_OPTIONS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TRAILER_OPTIONS };
    return { ...DEFAULT_TRAILER_OPTIONS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_TRAILER_OPTIONS };
  }
}

export function saveTrailerOptions(options: TrailerOptions): void {
  localStorage.setItem(TRAILER_OPTIONS_STORAGE_KEY, JSON.stringify(options));
}

export interface PlannedFollower {
  from: Square;
  to: Square | null;
  piece: Piece;
  promotion?: PieceType;
}
