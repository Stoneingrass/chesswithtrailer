import type { TrailerOptions } from '../../core';

export const TRAILER_OPTION_LABELS: Record<keyof TrailerOptions, string> = {
  allowFollowerCaptureWithoutLeadingCapture: 'Взятие "прицепом"',
  allowGroupCapture: 'Взятие нескольких фигур',
  allowFollowerFriendlyCapture: 'Взятие своих фигур "прицепом"',
  allowMultiFollower: '"Прицеп" из 2+ фигур',
  allowRecursiveGroup: 'Рекурсивное формирование "прицепа"',
  allowPassThrough: 'Перепрыгивание "прицепом" других фигур',
  followerOffBoardRemoved: '"Прицеп" может вылететь за доску',
  kingCannotBeFollower: 'Король не может быть "прицепом"',
};

export function renderOptionsPanel(options: TrailerOptions | null): string {
  if (!options) return '';

  const fields: Array<keyof TrailerOptions> = [
    'allowFollowerCaptureWithoutLeadingCapture',
    'allowGroupCapture',
    'allowFollowerFriendlyCapture',
    'allowMultiFollower',
    'allowRecursiveGroup',
    'allowPassThrough',
    'followerOffBoardRemoved',
    'kingCannotBeFollower',
  ];

  const items = fields
    .map((key) => {
      const checked = options[key] ? 'checked' : '';
      const label = TRAILER_OPTION_LABELS[key];
      return `
        <label class="trailer-option-item">
          <input type="checkbox" data-option="${key}" ${checked} />
          <span>${label}</span>
        </label>
      `;
    })
    .join('');

  return `
    <div class="trailer-options-panel">
      <h3>Опции "Прицепа"</h3>
      <div class="trailer-options-list">${items}</div>
    </div>
  `;
}
