export function initHelpModal(container: HTMLElement): void {
  const helpOverlay = container.querySelector<HTMLElement>('.help-modal-overlay');
  const helpBtn = container.querySelector<HTMLButtonElement>('.help-trigger-btn');
  const helpCloseBtn = container.querySelector<HTMLButtonElement>('.help-close-btn');

  if (!helpOverlay || !helpBtn || !helpCloseBtn) return;

  helpBtn.addEventListener('click', () => helpOverlay.classList.remove('hidden'));
  helpCloseBtn.addEventListener('click', () => helpOverlay.classList.add('hidden'));
  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) helpOverlay.classList.add('hidden');
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !helpOverlay.classList.contains('hidden')) {
      helpOverlay.classList.add('hidden');
    }
  });
}
