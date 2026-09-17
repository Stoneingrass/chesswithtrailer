export function getGameLayoutHtml(ruleSetName: string, optionsPanelHtml: string): string {
  return `
    <div class="game-layout">
      <header class="game-header">
        <div class="header-title-row">
          <h1>Chess with trailer</h1>
          <button type="button" class="btn btn-secondary help-trigger-btn" aria-label="Справка и правила">Правила</button>
        </div>
        <p class="subtitle game-subtitle">Локальный режим · ${ruleSetName}</p>
        <div class="mode-tabs">
          <button type="button" class="mode-tab active" data-mode="local">Локальная игра</button>
          <button type="button" class="mode-tab" data-mode="online">Игра по сети</button>
        </div>
      </header>
      <div class="game-body">
        <aside class="panel-left">
          <div class="net-room-slot"></div>
          <div class="trailer-options-slot">${optionsPanelHtml}</div>
        </aside>
        <main class="board-panel">
          <div class="board-wrapper">
            <div class="board" role="grid" aria-label="Шахматная доска"></div>
          </div>
          <div class="promotion-dialog hidden" role="dialog" aria-label="Выбор фигуры для превращения">
            <p>Превращение пешки</p>
            <div class="promotion-options"></div>
          </div>
        </main>
        <aside class="panel-right">
          <div class="status-panel">
            <div class="turn-indicator"></div>
            <div class="selection-hint"></div>
            <div class="game-status"></div>
          </div>
          <div class="history-panel">
            <h2>История ходов</h2>
            <ol class="move-history"></ol>
          </div>
          <div class="controls">
            <div class="history-navigation">
              <button type="button" class="btn btn-secondary" data-nav="start">|◀</button>
              <button type="button" class="btn btn-secondary" data-nav="back">◀</button>
              <button type="button" class="btn btn-secondary" data-nav="forward">▶</button>
              <button type="button" class="btn btn-secondary" data-nav="end">▶|</button>
            </div>
            <div class="timeline-status"></div>
            <div class="game-action-buttons hidden-action-block">
              <button type="button" class="btn btn-action action-takeback" data-action="takeback" title="Предложение возврата хода">
                <span class="action-icon">↺</span><span class="action-label">Ход назад</span>
              </button>
              <button type="button" class="btn btn-action action-draw" data-action="draw" title="Предложение ничьей">
                <span class="action-icon">🤝</span><span class="action-label">Ничья</span>
              </button>
              <button type="button" class="btn btn-action action-resign" data-action="resign" title="Сдаться">
                <span class="action-icon">🏳</span><span class="action-label">Сдаться</span>
              </button>
            </div>
            <div class="offer-proposal-bar hidden-action-block">
              <button type="button" class="btn btn-proposal btn-accept" data-action="proposal-accept" title="Согласиться">
                <span class="action-icon">✔</span><span class="action-label">Да</span>
              </button>
              <div class="proposal-label-box">
                <span class="proposal-text"></span>
              </div>
              <button type="button" class="btn btn-proposal btn-reject" data-action="proposal-reject" title="Отклонить">
                <span class="action-icon">✖</span><span class="action-label">Нет</span>
              </button>
            </div>
            <div class="button-group">
              <button type="button" class="btn btn-secondary" data-action="flip">Перевернуть</button>
              <button type="button" class="btn btn-primary" data-action="reset">Новая партия</button>
            </div>
          </div>
        </aside>
      </div>
      <div class="help-modal-overlay hidden" role="dialog" aria-modal="true" aria-label="Правила игры">
        <div class="help-modal">
          <div class="help-modal-header">
            <h2>Правила игры «Chess with trailer»</h2>
            <button type="button" class="help-close-btn" aria-label="Закрыть">&times;</button>
          </div>
          <div class="help-modal-body">
            <section class="help-section">
              <h3>♟️ Основная механика «Прицепа»</h3>
              <p>Вы делаете ход одной <strong>ведущей фигурой</strong>. Любые ваши фигуры, непосредственно защищающие ведущую (или связанные с ней цепочкой защиты), могут быть выбраны в качестве <strong>ведомых («прицепа»)</strong>.</p>
              <p>При совершении хода ведущей фигурой все выбранные ведомые фигуры автоматически смещаются на тот же вектор <code>(Δx, Δy)</code>.</p>
            </section>
            <section class="help-section">
              <h3>Доступные опции прицепа</h3>
              <ul class="help-options-list">
                <li><strong>Взятие «прицепом»</strong> — ведомые фигуры могут совершать взятие фигур противника при своём смещении.</li>
                <li><strong>Взятие нескольких фигур</strong> — группа ведомых фигур может брать сразу несколько фигур соперника за один ход.</li>
                <li><strong>«Прицеп» может сбивать свои фигуры</strong> — ведомая фигура может убрать фигуру своего цвета, стоящую на её новой клетке.</li>
                <li><strong>«Прицеп» из 2+ фигур</strong> — можно выбирать более одной ведомой фигуры за ход.</li>
                <li><strong>Рекурсивное присоединение к «прицепу»</strong> — защитники ведомых фигур также могут подключаться к прицепу цепочкой.</li>
                <li><strong>Перепрыгивание «прицепом»</strong> — ведомые фигуры могут перепрыгивать через занятые клетки на своём пути.</li>
                <li><strong>«Прицеп» может вылететь за доску</strong> — при выходе за пределы 8×8 ведомая фигура снимается с доски вместо отмены хода.</li>
                <li><strong>Король не может быть «прицепом»</strong> — Король используется только как ведущая фигура.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  `;
}
