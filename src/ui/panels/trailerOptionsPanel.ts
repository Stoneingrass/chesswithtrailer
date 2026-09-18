import type { TrailerOptions } from '../../core';

export const TRAILER_OPTION_LABELS: Record<keyof TrailerOptions, string> = {
  allowFollowerCaptureWithoutLeadingCapture: 'Взятие "прицепом"',
  allowGroupCapture: 'Взятие нескольких фигур',
  allowFollowerFriendlyCapture: 'Взятие своих фигур "прицепом"',
  allowMultiFollower: '"Прицеп" из 2+ фигур',
  allowRecursiveGroup: 'Рекурсивное формирование "прицепа"',
  followerOffBoardRemoved: '"Прицеп" может вылететь за доску',
  allowPassThrough: 'Перепрыгивание "прицепом" других фигур',
  disallowKnightFollowerJumping: 'Запрет на перепрыгивание "прицепом" за конём',
  disallowKnightTrailerJumping: 'Запрет на перепрыгивание для коня с "прицепом"',
  kingCannotBeFollower: 'Король не может быть "прицепом"',
};

export function renderOptionsPanel(options: TrailerOptions | null): string {
  if (!options) return '';

  const isCaptureSubDisabled = !options.allowFollowerCaptureWithoutLeadingCapture;
  const isMultiSubDisabled = !options.allowMultiFollower;
  const isPassThroughActive = options.allowPassThrough;
  const isKnightSubDisabled = !options.disallowKnightFollowerJumping || isPassThroughActive;

  const fields: Array<keyof TrailerOptions> = [
    'allowFollowerCaptureWithoutLeadingCapture',
    'allowGroupCapture',
    'allowFollowerFriendlyCapture',
    'allowMultiFollower',
    'allowRecursiveGroup',
    'allowPassThrough',
    'disallowKnightFollowerJumping',
    'disallowKnightTrailerJumping',
    'followerOffBoardRemoved',
    'kingCannotBeFollower',
  ];

  const items = fields
    .map((key) => {
      const isIndented =
        key === 'allowRecursiveGroup' ||
        key === 'allowGroupCapture' ||
        key === 'allowFollowerFriendlyCapture' ||
        key === 'disallowKnightTrailerJumping';

      const isDisabled =
        (key === 'allowRecursiveGroup' && isMultiSubDisabled) ||
        ((key === 'allowGroupCapture' || key === 'allowFollowerFriendlyCapture') &&
          isCaptureSubDisabled) ||
        (key === 'disallowKnightFollowerJumping' && isPassThroughActive) ||
        (key === 'disallowKnightTrailerJumping' && isKnightSubDisabled);

      const checked = options[key] ? 'checked' : '';
      const disabledAttr = isDisabled ? 'disabled' : '';
      const label = TRAILER_OPTION_LABELS[key];

      return `
        <label class="option-item ${isIndented ? 'is-indented' : ''} ${isDisabled ? 'is-disabled' : ''}">
          <input type="checkbox" data-opt="${key}" ${checked} ${disabledAttr} />
          <span>${label}</span>
        </label>`;
    })
    .join('');

  return `
    <div class="options-panel">
      <h2>Опции "Прицепа"</h2>
      ${items}
      <button type="button" class="btn btn-secondary btn-sm btn-block reset-options-btn" style="margin-top: 0.6rem;">Сбросить опции</button>
    </div>`;
}
