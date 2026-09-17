import type { Color, PieceType } from '../../core';
import { createPieceImg } from '../pieceAssets';

export function showPromotionDialog(
  promotionEl: HTMLElement,
  color: Color,
  titleText = 'Превращение пешки',
): Promise<PieceType | null> {
  return new Promise((resolve) => {
    const titleEl = promotionEl.querySelector('p');
    if (titleEl) titleEl.textContent = titleText;

    const options = promotionEl.querySelector('.promotion-options')!;
    options.innerHTML = '';
    promotionEl.classList.remove('hidden');

    const pieces: PieceType[] = ['q', 'r', 'b', 'n'];
    for (const type of pieces) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'promotion-piece';
      btn.appendChild(createPieceImg(color, type));
      btn.addEventListener('click', () => {
        promotionEl.classList.add('hidden');
        resolve(type);
      });
      options.appendChild(btn);
    }

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary promotion-cancel';
    cancel.textContent = 'Отмена';
    cancel.addEventListener('click', () => {
      promotionEl.classList.add('hidden');
      resolve(null);
    });
    options.appendChild(cancel);
  });
}
