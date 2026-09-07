import type { Color, PieceType } from '../core';

export function pieceImageSrc(color: Color, type: PieceType): string {
  return `/pieces/${color}${type.toUpperCase()}.svg`;
}

export function createPieceImg(color: Color, type: PieceType): HTMLImageElement {
  const img = document.createElement('img');
  img.src = pieceImageSrc(color, type);
  img.alt = `${color === 'w' ? 'white' : 'black'} ${type}`;
  img.className = 'piece-img';
  img.draggable = false;
  return img;
}
