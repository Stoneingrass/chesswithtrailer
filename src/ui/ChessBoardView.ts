import type { Color, GameController, GameResult, GameSnapshot, Move, Piece, PieceType, Square, TrailerOptions } from '../core';
import { addDelta, getDelta, DEFAULT_TRAILER_OPTIONS } from '../core';
import { NetworkManager } from '../net';
import { createPieceImg } from './pieceAssets';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];
const SAVE_KEY = 'omnichess-saved-game-state';

const TRAILER_OPTION_LABELS: Record<keyof TrailerOptions, string> = {
  allowFollowerCaptureWithoutLeadingCapture: 'Взятие "прицепом"',
  allowGroupCapture: 'Взятие нескольких фигур',
  allowFollowerFriendlyCapture: 'Взятие своих фигур "прицепом"',
  allowMultiFollower: '"Прицеп" из 2+ фигур',
  allowRecursiveGroup: 'Рекурсивное формирование "прицепа"',
  allowPassThrough: 'Перепрыгивание "прицепом" других фигур',
  followerOffBoardRemoved: '"Прицеп" может вылететь за доску',
  kingCannotBeFollower: 'Король не может быть "прицепом"',
};

function resultMessage(result: GameResult): string {
  switch (result.status) {
    case 'ongoing':
      return '';
    case 'checkmate':
      return `Мат! Победили ${result.winner === 'w' ? 'белые' : 'чёрные'}.`;
    case 'stalemate':
      return 'Пат — ничья.';
    case 'draw':
      return `Ничья (${result.reason}).`;
    case 'resigned':
      return `Сдались. Победили ${result.winner === 'w' ? 'белые' : 'чёрные'}.`;
  }
}

export class ChessBoardView {
  private leadingSquare: Square | null = null;
  private followerSquares = new Set<Square>();
  private legalTargets = new Set<Square>();
  private lastMoveSquares = new Set<Square>();
  private flipped = false;
  private draggedSquare: Square | null = null;
  private timeline: GameSnapshot[] = [];
  private timelineIndex = 0;
  private isBrowsingHistory = false;
  private isLastMoveFromDrag = false;

  private touchDragFrom: Square | null = null;
  private touchDragAvatar: HTMLElement | null = null;
  private touchDragStartX = 0;
  private touchDragStartY = 0;
  private isTouchDragging = false;
  private ignoreNextClick = false;

  private mode: 'local' | 'online' = 'local';
  private net = new NetworkManager();
  private netErrorMessage: string | null = null;

  private boardEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private historyEl!: HTMLElement;
  private promotionEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private optionsSlotEl!: HTMLElement;
  private netSlotEl!: HTMLElement;
  private headerSubEl!: HTMLElement;

  constructor(
    private container: HTMLElement,
    private game: GameController,
  ) {}

  mount(): void {
    this.container.innerHTML = `
      <div class="game-layout">
        <header class="game-header">
          <div class="header-title-row">
            <h1>Chess with trailer</h1>
            <button type="button" class="btn btn-secondary help-trigger-btn" aria-label="Справка и правила">Правила</button>
          </div>
          <p class="subtitle game-subtitle">Локальный режим · ${this.game.getRuleSetName()}</p>
          <div class="mode-tabs">
            <button type="button" class="mode-tab active" data-mode="local">Локальная игра</button>
            <button type="button" class="mode-tab" data-mode="online">Игра по сети</button>
          </div>
        </header>
        <div class="game-body">
          <aside class="panel-left">
            <div class="net-room-slot"></div>
            <div class="trailer-options-slot">${this.renderOptionsPanel()}</div>
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

    const helpOverlay = this.container.querySelector<HTMLElement>('.help-modal-overlay')!;
    const helpBtn = this.container.querySelector<HTMLButtonElement>('.help-trigger-btn')!;
    const helpCloseBtn = this.container.querySelector<HTMLButtonElement>('.help-close-btn')!;

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

    this.boardEl = this.container.querySelector('.board')!;
    this.statusEl = this.container.querySelector('.game-status')!;
    this.historyEl = this.container.querySelector('.move-history')!;
    this.promotionEl = this.container.querySelector('.promotion-dialog')!;
    this.hintEl = this.container.querySelector('.selection-hint')!;
    this.optionsSlotEl = this.container.querySelector('.trailer-options-slot')!;
    this.netSlotEl = this.container.querySelector('.net-room-slot')!;
    this.headerSubEl = this.container.querySelector('.game-subtitle')!;

    this.timeline = [this.game.getSnapshot()];
    this.timelineIndex = 0;

    // Restore saved game state if present in localStorage
    this.loadPersistedState();

    this.setupModeTabs();
    this.setupNetworkEvents();

    this.container.querySelector('[data-action="reset"]')!.addEventListener('click', () => {
      this.game.reset();
      this.clearPersistedState();
      if (this.mode === 'online' && this.net.isConnected()) {
        this.net.sendMessage({ type: 'RESET_GAME', snapshot: this.game.getSnapshot() });
      }
    });

    this.container.querySelector('[data-action="flip"]')!.addEventListener('click', () => {
      this.flipped = !this.flipped;
      this.render();
    });
    this.historyEl.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.move-san');
      if (!target) return;
      const snapIdx = parseInt(target.dataset.snapshot ?? '', 10);
      if (!isNaN(snapIdx)) {
        this.showTimeline(snapIdx);
      }
    });

    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable) {
        return;
      }
      if (!helpOverlay.classList.contains('hidden') || !this.promotionEl.classList.contains('hidden')) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.showTimeline(this.timelineIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.showTimeline(this.timelineIndex + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.showTimeline(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.showTimeline(this.timeline.length - 1);
      }
    });

    this.container.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((button) => {
      button.addEventListener('click', () => {
        const nav = button.dataset.nav;
        const target =
          nav === 'start'
            ? 0
            : nav === 'back'
              ? this.timelineIndex - 1
              : nav === 'forward'
                ? this.timelineIndex + 1
                : this.timeline.length - 1;
        this.showTimeline(target);
      });
    });

    this.bindOptionsPanel();

    this.game.subscribe((event) => {
      if (event.type === 'move') {
        if (this.timelineIndex === this.timeline.length - 1) this.timeline.push(event.snapshot);
        this.timelineIndex = this.timeline.length - 1;
        this.lastMoveSquares = new Set([event.move.from, event.move.to]);
        for (const f of event.move.followers ?? []) {
          this.lastMoveSquares.add(f.from);
          this.lastMoveSquares.add(f.to);
        }
        this.savePersistedState();
      }
      if (event.type === 'reset') {
        this.lastMoveSquares.clear();
        this.clearSelection();
        if (!this.isBrowsingHistory) {
          this.timeline = [event.snapshot];
          this.timelineIndex = 0;
        }
      }
      this.render();
    });

    // Auto-join room if room query parameter is present in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      this.switchMode('online');
      void this.joinRoom(roomParam);
    } else {
      this.render();
    }
  }

  private savePersistedState(): void {
    try {
      const data = {
        snapshot: this.game.getSnapshot(),
        timeline: this.timeline,
        timelineIndex: this.timelineIndex,
        options: this.game.getTrailerOptions(),
        lastMoveSquares: Array.from(this.lastMoveSquares),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save persisted state:', e);
    }
  }

  private loadPersistedState(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data && data.snapshot && Array.isArray(data.timeline) && data.timeline.length > 0) {
        if (data.options) {
          this.game.setTrailerOptions(data.options);
        }
        this.timeline = data.timeline;
        this.timelineIndex = Math.max(
          0,
          Math.min(data.timelineIndex ?? data.timeline.length - 1, data.timeline.length - 1),
        );
        this.isBrowsingHistory = true;
        try {
          this.game.loadSnapshot(this.timeline[this.timelineIndex]);
        } finally {
          this.isBrowsingHistory = false;
        }
        if (Array.isArray(data.lastMoveSquares)) {
          this.lastMoveSquares = new Set(data.lastMoveSquares);
        }
        return true;
      }
    } catch (e) {
      console.error('Failed to load persisted state:', e);
    }
    return false;
  }

  private clearPersistedState(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
  }

  private setupModeTabs(): void {
    this.container.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode as 'local' | 'online';
        this.switchMode(mode);
      });
    });
  }

  private switchMode(newMode: 'local' | 'online'): void {
    if (this.mode === newMode) return;
    this.mode = newMode;

    this.container.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.mode === newMode);
    });

    if (newMode === 'local') {
      this.net.disconnect();
      this.headerSubEl.textContent = `Локальный режим · ${this.game.getRuleSetName()}`;
    } else {
      this.headerSubEl.textContent = `Игра по сети · ${this.game.getRuleSetName()}`;
    }

    this.clearSelection();
    this.render();
  }

  private setupNetworkEvents(): void {
    this.net.on('statusChange', (_status, msg) => {
      this.netErrorMessage = msg ?? null;
      this.renderNetSlot();
      this.renderHint();
    });

    this.net.on('partnerConnected', (myColor) => {
      this.flipped = myColor === 'b';
      this.render();
    });

    this.net.on('partnerDisconnected', () => {
      this.renderHint();
    });

    this.net.on('message', (msg) => {
      if (msg.type === 'INIT_GAME') {
        this.isBrowsingHistory = true;
        try {
          this.game.loadSnapshot(msg.snapshot);
        } finally {
          this.isBrowsingHistory = false;
        }
        this.game.setTrailerOptions(msg.options);
        this.timeline = [msg.snapshot];
        this.timelineIndex = 0;
        this.refreshOptionsPanel();
        this.render();
      } else if (msg.type === 'MOVE') {
        this.isBrowsingHistory = true;
        try {
          this.game.loadSnapshot(msg.snapshot);
        } finally {
          this.isBrowsingHistory = false;
        }
        this.timeline.push(msg.snapshot);
        this.timelineIndex = this.timeline.length - 1;
        this.lastMoveSquares = new Set([msg.move.from, msg.move.to]);
        for (const f of msg.move.followers ?? []) {
          this.lastMoveSquares.add(f.from);
          this.lastMoveSquares.add(f.to);
        }
        this.render();
      } else if (msg.type === 'CHANGE_OPTIONS') {
        this.game.setTrailerOptions(msg.options);
        this.refreshOptionsPanel();
        this.refreshLegalTargets();
        this.render();
      } else if (msg.type === 'RESET_GAME') {
        this.isBrowsingHistory = true;
        try {
          this.game.loadSnapshot(msg.snapshot);
        } finally {
          this.isBrowsingHistory = false;
        }
        this.timeline = [msg.snapshot];
        this.timelineIndex = 0;
        this.clearSelection();
        this.render();
      } else if (msg.type === 'ERROR') {
        this.netErrorMessage = msg.message;
        this.renderNetSlot();
      }
    });
  }

  private async createRoom(): Promise<void> {
    try {
      await this.net.createRoom(() => ({
        snapshot: this.game.getSnapshot(),
        options: this.game.getTrailerOptions() ?? ({} as TrailerOptions),
      }));
      this.renderNetSlot();
    } catch (err) {
      console.error('Failed to create room:', err);
    }
  }

  private async joinRoom(code: string): Promise<void> {
    if (!code) return;
    try {
      await this.net.joinRoom(code);
      this.renderNetSlot();
    } catch (err) {
      console.error('Failed to join room:', err);
    }
  }

  private renderNetSlot(): void {
    if (this.mode !== 'online') {
      this.netSlotEl.innerHTML = '';
      return;
    }

    const netStatus = this.net.getStatus();
    const roomCode = this.net.getRoomCode();
    const myColor = this.net.getMyColor();

    if (netStatus === 'disconnected') {
      this.netSlotEl.innerHTML = `
        <div class="net-panel">
          <h2>Игра по сети</h2>
          <button type="button" class="btn btn-primary btn-block" data-net-action="create">⚡ Создать комнату</button>
          <div class="net-divider">или войти по коду</div>
          <form class="join-form">
            <input type="text" class="room-code-input" placeholder="напр. K9X2P4" maxLength="6" />
            <button type="submit" class="btn btn-secondary">Войти</button>
          </form>
        </div>
      `;

      this.netSlotEl.querySelector('[data-net-action="create"]')?.addEventListener('click', () => {
        void this.createRoom();
      });

      this.netSlotEl.querySelector('.join-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = this.netSlotEl.querySelector<HTMLInputElement>('.room-code-input');
        if (input && input.value) {
          void this.joinRoom(input.value);
        }
      });
      return;
    }

    if (netStatus === 'waiting_for_peer') {
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      this.netSlotEl.innerHTML = `
        <div class="net-panel">
          <h2>Игра по сети</h2>
          <div class="net-status-box waiting">
            <p>Код комнаты: <strong class="room-code-display">${roomCode}</strong></p>
            <button type="button" class="btn btn-secondary btn-sm btn-block" data-net-action="copy-link">📋 Скопировать ссылку</button>
            <p class="status-msg">Ожидание подключения второго игрока...</p>
            <button type="button" class="btn btn-link btn-sm" data-net-action="leave">Отмена</button>
          </div>
        </div>
      `;

      this.netSlotEl.querySelector('[data-net-action="copy-link"]')?.addEventListener('click', () => {
        void navigator.clipboard.writeText(shareUrl).then(() => {
          const btn = this.netSlotEl.querySelector<HTMLButtonElement>('[data-net-action="copy-link"]');
          if (btn) btn.textContent = '✓ Ссылка скопирована!';
        });
      });

      this.netSlotEl.querySelector('[data-net-action="leave"]')?.addEventListener('click', () => {
        this.net.disconnect();
        this.renderNetSlot();
      });
      return;
    }

    if (netStatus === 'connecting') {
      this.netSlotEl.innerHTML = `
        <div class="net-panel">
          <h2>Игра по сети</h2>
          <div class="net-status-box connecting">
            <p class="status-msg">Подключение к комнате <strong>${roomCode}</strong>...</p>
          </div>
        </div>
      `;
      return;
    }

    if (netStatus === 'connected') {
      const colorText = myColor === 'w' ? 'Белые (♔)' : 'Чёрные (♚)';
      this.netSlotEl.innerHTML = `
        <div class="net-panel">
          <h2>Игра по сети</h2>
          <div class="net-status-box connected">
            <div class="online-badge">● В сети</div>
            <p>Комната: <strong>${roomCode}</strong></p>
            <p>Ваш цвет: <strong>${colorText}</strong></p>
            <button type="button" class="btn btn-secondary btn-sm btn-block" data-net-action="leave">Покинуть комнату</button>
          </div>
        </div>
      `;

      this.netSlotEl.querySelector('[data-net-action="leave"]')?.addEventListener('click', () => {
        this.net.disconnect();
        this.renderNetSlot();
      });
      return;
    }

    if (netStatus === 'error') {
      this.netSlotEl.innerHTML = `
        <div class="net-panel">
          <h2>Игра по сети</h2>
          <div class="net-status-box error">
            <p class="error-msg">${this.netErrorMessage || 'Ошибка подключения'}</p>
            <button type="button" class="btn btn-secondary btn-sm" data-net-action="leave">Сбросить</button>
          </div>
        </div>
      `;

      this.netSlotEl.querySelector('[data-net-action="leave"]')?.addEventListener('click', () => {
        this.net.disconnect();
        this.renderNetSlot();
      });
    }
  }

  private renderOptionsPanel(): string {
    const opts = this.game.getTrailerOptions();
    if (!opts) return '';

    const isCaptureSubDisabled = !opts.allowFollowerCaptureWithoutLeadingCapture;
    const isMultiSubDisabled = !opts.allowMultiFollower;

    const items = (Object.keys(TRAILER_OPTION_LABELS) as Array<keyof TrailerOptions>)
      .map((key) => {
        const isIndented =
          key === 'allowRecursiveGroup' ||
          key === 'allowGroupCapture' ||
          key === 'allowFollowerFriendlyCapture';

        const isDisabled =
          (key === 'allowRecursiveGroup' && isMultiSubDisabled) ||
          ((key === 'allowGroupCapture' || key === 'allowFollowerFriendlyCapture') &&
            isCaptureSubDisabled);

        return `
        <label class="option-item ${isIndented ? 'is-indented' : ''} ${isDisabled ? 'is-disabled' : ''}">
          <input type="checkbox" data-opt="${key}" ${opts[key] ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} />
          <span>${TRAILER_OPTION_LABELS[key]}</span>
        </label>`;
      })
      .join('');

    return `
      <div class="options-panel">
        <h2>Опции прицепа</h2>
        ${items}
        <button type="button" class="btn btn-secondary btn-sm btn-block reset-options-btn" style="margin-top: 0.6rem;">Сбросить опции</button>
      </div>`;
  }

  private bindOptionsPanel(): void {
    this.container.querySelectorAll<HTMLInputElement>('input[data-opt]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.dataset.opt as keyof TrailerOptions;
        const change: Partial<TrailerOptions> = { [key]: input.checked };
        if (key === 'allowMultiFollower' && !input.checked) {
          change.allowRecursiveGroup = false;
        }
        if (key === 'allowFollowerCaptureWithoutLeadingCapture' && !input.checked) {
          change.allowGroupCapture = false;
          change.allowFollowerFriendlyCapture = false;
        }
        this.game.setTrailerOptions(change);
        if (this.mode === 'online' && this.net.isConnected()) {
          this.net.sendMessage({ type: 'CHANGE_OPTIONS', options: change });
        }
        this.savePersistedState();
        this.refreshOptionsPanel();
        this.refreshLegalTargets();
        this.render();
      });
    });

    this.optionsSlotEl.querySelector('.reset-options-btn')?.addEventListener('click', () => {
      this.game.setTrailerOptions({ ...DEFAULT_TRAILER_OPTIONS });
      if (this.mode === 'online' && this.net.isConnected()) {
        this.net.sendMessage({ type: 'CHANGE_OPTIONS', options: { ...DEFAULT_TRAILER_OPTIONS } });
      }
      this.savePersistedState();
      this.refreshOptionsPanel();
      this.refreshLegalTargets();
      this.render();
    });
  }

  private render(): void {
    this.renderNetSlot();
    this.renderBoard();
    this.renderStatus();
    this.renderHistory();
    this.renderHint();
    this.renderControls();
  }

  private renderControls(): void {
    const isAtStart = this.timelineIndex === 0;
    const isAtEnd = this.timelineIndex === this.timeline.length - 1;

    const btnStart = this.container.querySelector<HTMLButtonElement>('[data-nav="start"]');
    const btnBack = this.container.querySelector<HTMLButtonElement>('[data-nav="back"]');
    const btnForward = this.container.querySelector<HTMLButtonElement>('[data-nav="forward"]');
    const btnEnd = this.container.querySelector<HTMLButtonElement>('[data-nav="end"]');

    if (btnStart) btnStart.disabled = isAtStart;
    if (btnBack) btnBack.disabled = isAtStart;
    if (btnForward) btnForward.disabled = isAtEnd;
    if (btnEnd) btnEnd.disabled = isAtEnd;

    const latestSnapshot = this.timeline[this.timeline.length - 1];
    const gameIsOngoing = latestSnapshot ? latestSnapshot.result.status === 'ongoing' : true;
    const isBrowsingPast = !isAtEnd;
    const shouldPulse = isBrowsingPast && gameIsOngoing;

    if (btnEnd) {
      btnEnd.classList.toggle('pulse', shouldPulse);
    }
  }

  private showTimeline(index: number): void {
    const next = Math.max(0, Math.min(index, this.timeline.length - 1));
    if (next === this.timelineIndex) return;

    const oldBoardState = this.captureBoardState();

    this.timelineIndex = next;
    this.isBrowsingHistory = true;
    try {
      this.game.loadSnapshot(this.timeline[next]);
    } finally {
      this.isBrowsingHistory = false;
    }
    this.clearSelection();

    const snap = this.timeline[next];
    if (next > 0 && snap && snap.moveHistory.length > 0) {
      const lastMove = snap.moveHistory[snap.moveHistory.length - 1];
      this.lastMoveSquares = new Set([lastMove.from, lastMove.to]);
      for (const f of lastMove.followers ?? []) {
        this.lastMoveSquares.add(f.from);
        this.lastMoveSquares.add(f.to);
      }
    } else {
      this.lastMoveSquares.clear();
    }

    this.render();
    this.animateBoardTransition(oldBoardState, 160);
  }

  private getSelectableFollowers(): Square[] {
    if (!this.leadingSquare) return [];
    const opts = this.game.getTrailerOptions();
    const direct = this.game.getDirectProtectors(this.leadingSquare);
    if (!opts?.allowRecursiveGroup || !opts?.allowMultiFollower) {
      return direct.filter((p) => !opts?.kingCannotBeFollower || this.game.getPiece(p)?.type !== 'k');
    }

    const selectable = new Set<Square>();
    for (const p of direct) {
      if (!opts?.kingCannotBeFollower || this.game.getPiece(p)?.type !== 'k') {
        selectable.add(p);
      }
    }

    for (const follower of this.followerSquares) {
      for (const p of this.game.getDirectProtectors(follower)) {
        if (p !== this.leadingSquare && (!opts?.kingCannotBeFollower || this.game.getPiece(p)?.type !== 'k')) {
          selectable.add(p);
        }
      }
    }
    return [...selectable];
  }

  private renderHint(): void {
    const result = this.game.getResult();
    if (result.status !== 'ongoing') {
      this.hintEl.textContent = '';
      return;
    }

    if (this.mode === 'online') {
      if (!this.net.isConnected()) {
        this.hintEl.textContent = 'Ожидание подключения соперника по сети...';
        return;
      }
      if (this.game.getTurn() !== this.net.getMyColor()) {
        this.hintEl.textContent = 'Ожидание хода соперника...';
        return;
      }
    }

    if (!this.leadingSquare) {
      this.hintEl.textContent = 'Выберите ведущую фигуру. Затем — необязательно — ведомую (защитника).';
      return;
    }

    const selectable = this.getSelectableFollowers();
    if (this.followerSquares.size === 0) {
      this.hintEl.textContent =
        selectable.length > 0
          ? `Ведущая: ${this.leadingSquare}. Можно добавить ведомую (${selectable.join(', ')}).`
          : `Ведущая: ${this.leadingSquare}. Нет доступных ведомых — обычный ход.`;
    } else {
      this.hintEl.textContent = `Ведущая: ${this.leadingSquare}, ведомые: ${[...this.followerSquares].join(', ')}.`;
    }
  }

  private getProtectionDepths(leadingSq: Square): Map<Square, number> {
    const depths = new Map<Square, number>();
    const opts = this.game.getTrailerOptions();
    if (!opts) return depths;

    const queue: Array<{ square: Square; depth: number }> = [{ square: leadingSq, depth: 0 }];
    const visited = new Set<Square>([leadingSq]);

    while (queue.length > 0) {
      const { square: curr, depth: currDepth } = queue.shift()!;
      const protectors = this.game.getDirectProtectors(curr);

      for (const p of protectors) {
        if (visited.has(p)) continue;
        if (opts.kingCannotBeFollower && this.game.getPiece(p)?.type === 'k') continue;

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

  private pruneDisconnectedFollowers(): void {
    if (!this.leadingSquare || this.followerSquares.size === 0) return;

    const reachable = new Set<Square>([this.leadingSquare]);
    let changed = true;

    while (changed) {
      changed = false;
      for (const follower of Array.from(this.followerSquares)) {
        if (!reachable.has(follower)) {
          for (const targetSq of Array.from(reachable)) {
            const protectors = this.game.getDirectProtectors(targetSq);
            if (protectors.includes(follower)) {
              reachable.add(follower);
              changed = true;
              break;
            }
          }
        }
      }
    }

    for (const follower of Array.from(this.followerSquares)) {
      if (!reachable.has(follower)) {
        this.followerSquares.delete(follower);
      }
    }
  }

  private renderBoard(): void {
    this.boardEl.innerHTML = '';
    const displayFiles = this.flipped ? [...FILES].reverse() : FILES;
    const displayRanks = this.flipped ? [...RANKS].reverse() : RANKS;

    const protectionDepths = this.leadingSquare ? this.getProtectionDepths(this.leadingSquare) : new Map<Square, number>();

    for (const rank of displayRanks) {
      for (const file of displayFiles) {
        const square = `${file}${rank}` as Square;
        const fileIdx = FILES.indexOf(file);
        const rankIdx = parseInt(rank, 10);
        const isLight = (fileIdx + rankIdx) % 2 === 0;

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'square';
        cell.dataset.square = square;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', square);
        cell.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          this.clearSelection();
        });

        if (isLight) cell.classList.add('light');
        else cell.classList.add('dark');

        if (this.leadingSquare === square) cell.classList.add('selected');
        if (this.followerSquares.has(square)) cell.classList.add('follower-selected');
        if (this.legalTargets.has(square)) cell.classList.add('target');
        if (this.lastMoveSquares.has(square)) cell.classList.add('last-move');

        if (
          this.leadingSquare &&
          protectionDepths.has(square) &&
          square !== this.leadingSquare &&
          !this.followerSquares.has(square)
        ) {
          cell.classList.add('chain-marker');
          const d = protectionDepths.get(square)!;
          if (d === 1) cell.classList.add('chain-depth-1');
          else if (d === 2) cell.classList.add('chain-depth-2');
          else if (d === 3) cell.classList.add('chain-depth-3');
          else cell.classList.add('chain-depth-4');
        }

        const piece = this.game.getPiece(square);
        if (piece) {
          const image = createPieceImg(piece.color, piece.type);
          image.draggable = true;
          image.addEventListener('dragstart', (event) => this.onDragStart(event, square));
          image.addEventListener('dragend', () => this.clearDragState());
          cell.appendChild(image);
        }

        cell.addEventListener('dragover', (event) => this.onDragOver(event, square));
        cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
        cell.addEventListener('drop', (event) => this.onDrop(event, square));
        cell.addEventListener('pointerdown', (event) => this.onPointerDown(event, square));
        cell.addEventListener('click', () => this.onSquareClick(square));
        this.boardEl.appendChild(cell);
      }
    }
  }

  private renderStatus(): void {
    const turnEl = this.container.querySelector('.turn-indicator')!;
    const turn = this.game.getTurn();
    const result = this.game.getResult();
    const inCheck = this.game.isInCheck();

    if (result.status === 'ongoing') {
      const turnImg = createPieceImg(turn, 'k');
      turnImg.classList.add('turn-badge-img');
      turnEl.innerHTML = '';
      turnEl.appendChild(turnImg);
      const text = document.createElement('span');
      text.innerHTML = `Ход ${turn === 'w' ? 'белых' : 'чёрных'}${inCheck ? ' · <strong>Шах!</strong>' : ''}`;
      turnEl.appendChild(text);
    } else {
      turnEl.innerHTML = '';
    }

    const msg = resultMessage(result);
    this.statusEl.textContent = msg;
    this.statusEl.className = `game-status ${result.status !== 'ongoing' ? 'game-over' : ''}`;
  }

  private renderHistory(): void {
    const latestSnapshot = this.timeline[this.timeline.length - 1];
    const fullMoves = latestSnapshot?.moveHistory ?? [];
    this.historyEl.innerHTML = '';

    for (let i = 0; i < fullMoves.length; i += 2) {
      const li = document.createElement('li');
      const moveNum = Math.floor(i / 2) + 1;
      const whiteSnap = i + 1;
      const blackSnap = i + 2;

      const whiteSan = fullMoves[i]?.san ?? '';
      const blackSan = fullMoves[i + 1]?.san ?? '';

      const isWhiteActive = this.timelineIndex === whiteSnap;
      const isBlackActive = this.timelineIndex === blackSnap;

      let html = `<span class="move-num">${moveNum}.</span>`;
      html += ` <span class="move-san ${isWhiteActive ? 'active' : ''}" data-snapshot="${whiteSnap}">${whiteSan}</span>`;
      if (fullMoves[i + 1]) {
        html += ` <span class="move-san ${isBlackActive ? 'active' : ''}" data-snapshot="${blackSnap}">${blackSan}</span>`;
      }
      li.innerHTML = html;
      this.historyEl.appendChild(li);
    }

    const activeSpan = this.historyEl.querySelector<HTMLElement>('.move-san.active');
    if (activeSpan) {
      const container = this.historyEl;
      const itemTop = activeSpan.offsetTop - container.offsetTop;
      const itemBottom = itemTop + activeSpan.offsetHeight;
      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;

      if (itemTop < containerTop) {
        container.scrollTop = itemTop;
      } else if (itemBottom > containerBottom) {
        container.scrollTop = itemBottom - container.clientHeight;
      }
    }
  }

  private isMyTurn(): boolean {
    if (this.mode === 'local') return true;
    if (!this.net.isConnected()) return false;
    return this.game.getTurn() === this.net.getMyColor();
  }

  private onSquareClick(square: Square): void {
    if (this.ignoreNextClick) {
      this.ignoreNextClick = false;
      return;
    }
    if (this.timelineIndex !== this.timeline.length - 1) return;
    if (!this.isMyTurn()) return;
    const result = this.game.getResult();
    if (result.status !== 'ongoing') return;

    const piece = this.game.getPiece(square);
    const turn = this.game.getTurn();

    if (this.leadingSquare) {
      if (this.legalTargets.has(square)) {
        void this.attemptMove(this.leadingSquare, square);
        return;
      }

      if (this.followerSquares.has(square)) {
        this.toggleFollower(square);
        return;
      }

      if (piece && piece.color === turn && square !== this.leadingSquare) {
        const selectable = this.getSelectableFollowers();
        if (selectable.includes(square)) {
          this.toggleFollower(square);
          return;
        }

        const depths = this.getProtectionDepths(this.leadingSquare);
        if (depths.has(square)) {
          // Inside protection tree of leading piece, but intermediate link is missing. Do not add as follower & do not switch leading piece.
          return;
        }

        this.selectLeading(square);
        return;
      }

      if (square === this.leadingSquare) {
        this.clearSelection();
        return;
      }

      this.clearSelection();
      return;
    }

    if (piece && piece.color === turn) {
      this.selectLeading(square);
    }
  }

  private toggleFollower(square: Square): void {
    const opts = this.game.getTrailerOptions();
    if (this.followerSquares.has(square)) {
      this.followerSquares.delete(square);
      this.pruneDisconnectedFollowers();
    } else {
      if (!opts?.allowMultiFollower) {
        this.followerSquares.clear();
      }
      this.followerSquares.add(square);
      this.pruneDisconnectedFollowers();
    }
    this.refreshLegalTargets();
    this.render();
  }

  private selectLeading(square: Square): void {
    this.leadingSquare = square;
    this.followerSquares.clear();
    this.refreshLegalTargets();
    this.render();
  }

  private refreshLegalTargets(): void {
    if (!this.leadingSquare) {
      this.legalTargets.clear();
      return;
    }
    const context =
      this.followerSquares.size > 0 ? { followers: [...this.followerSquares] } : undefined;
    this.legalTargets = new Set(
      this.game.getLegalMoves(this.leadingSquare, context).map((m) => m.to),
    );
  }

  private clearSelection(): void {
    this.leadingSquare = null;
    this.followerSquares.clear();
    this.legalTargets.clear();
    this.renderBoard();
    this.renderHint();
  }

  private async attemptMove(from: Square, to: Square): Promise<void> {
    const promotingPawns: Array<{ from: Square; to: Square; isLeading: boolean }> = [];
    const turn = this.game.getTurn();

    const leadingPiece = this.game.getPiece(from);
    if (leadingPiece && leadingPiece.type === 'p') {
      const lastRank = leadingPiece.color === 'w' ? '8' : '1';
      if (to[1] === lastRank) {
        promotingPawns.push({ from, to, isLeading: true });
      }
    }

    const { df, dr } = getDelta(from, to);
    for (const fSq of this.followerSquares) {
      const fPiece = this.game.getPiece(fSq);
      if (fPiece && fPiece.type === 'p') {
        const fTo = addDelta(fSq, df, dr);
        if (fTo !== null) {
          const lastRank = fPiece.color === 'w' ? '8' : '1';
          if (fTo[1] === lastRank) {
            promotingPawns.push({ from: fSq, to: fTo, isLeading: false });
          }
        }
      }
    }

    let leadingPromotion: PieceType | undefined = undefined;
    const followerPromotions: Partial<Record<Square, PieceType>> = {};

    if (promotingPawns.length > 0) {
      for (const p of promotingPawns) {
        const label = p.isLeading
          ? `Превращение ведущей пешки (${p.from} → ${p.to})`
          : `Превращение ведомой пешки (${p.from} → ${p.to})`;

        const choice = await this.showPromotionDialog(turn, label);
        if (!choice) {
          this.clearSelection();
          return;
        }

        if (p.isLeading) {
          leadingPromotion = choice;
        } else {
          followerPromotions[p.from] = choice;
        }
      }
    }

    const context =
      this.followerSquares.size > 0
        ? {
            followers: [...this.followerSquares],
            followerPromotions:
              Object.keys(followerPromotions).length > 0 ? followerPromotions : undefined,
          }
        : undefined;

    this.executeMove(from, to, leadingPromotion, context);
  }

  private captureBoardState(): Map<Square, Piece> {
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
      const p = this.game.getPiece(sq);
      if (p) state.set(sq, { type: p.type, color: p.color });
    }
    return state;
  }

  private animateBoardTransition(
    oldBoardState: Map<Square, Piece>,
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
      const newP = this.game.getPiece(sq);
      const oldP = oldBoardState.get(sq);
      if (newP && oldP && newP.type === oldP.type && newP.color === oldP.color) {
        usedOldSquares.add(sq);
      } else if (newP) {
        changedNewSquares.push(sq);
      }
    }

    const shifts: Array<{ from: Square; to: Square }> = [];

    for (const newSq of changedNewSquares) {
      const newP = this.game.getPiece(newSq)!;
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
      this.animateShifts(shifts, duration);
    }
  }

  private executeMove(
    from: Square,
    to: Square,
    promotion?: PieceType,
    context?: { followers: Square[]; followerPromotions?: Partial<Record<Square, PieceType>> },
  ): void {
    const wasDrag = this.isLastMoveFromDrag;
    this.isLastMoveFromDrag = false;

    const result = this.game.tryMove(from, to, promotion, context);
    this.leadingSquare = null;
    this.followerSquares.clear();
    this.legalTargets.clear();
    if (!result.ok) {
      console.warn(result.reason);
    } else {
      this.savePersistedState();
      if (this.mode === 'online' && this.net.isConnected()) {
        this.net.sendMessage({ type: 'MOVE', move: result.move, snapshot: result.snapshot });
      }
    }
    this.render();
    if (result.ok && !wasDrag) {
      this.animateGroupMove(result.move, 220);
    }
  }

  private animateGroupMove(move: Move, duration = 220): void {
    const shifts = [{ from: move.from, to: move.to }, ...(move.followers ?? [])]
      .filter((shift) => !('removed' in shift && shift.removed))
      .map((s) => ({ from: s.from, to: s.to }));
    this.animateShifts(shifts, duration);
  }

  private animateShifts(shifts: Array<{ from: Square; to: Square }>, duration = 200): void {
    this.boardEl.querySelectorAll('.moving-piece').forEach((el) => el.remove());
    this.boardEl.querySelectorAll<HTMLElement>('.piece-img').forEach((img) => (img.style.visibility = 'visible'));

    for (const shift of shifts) {
      if (shift.from === shift.to) continue;
      const fromCell = this.boardEl.querySelector<HTMLElement>(`[data-square="${shift.from}"]`);
      const toCell = this.boardEl.querySelector<HTMLElement>(`[data-square="${shift.to}"]`);
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

  private refreshOptionsPanel(): void {
    this.optionsSlotEl.innerHTML = this.renderOptionsPanel();
    this.bindOptionsPanel();
  }

  private createDragPreview(event: DragEvent, leadingSq: Square, followerSqs: Set<Square>): void {
    if (!event.dataTransfer) return;

    const group = [leadingSq, ...followerSqs];
    const files = group.map((sq) => FILES.indexOf(sq[0]));
    const ranks = group.map((sq) => parseInt(sq[1], 10));

    const minFile = Math.min(...files);
    const maxFile = Math.max(...files);
    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);

    const leadingCell = this.boardEl.querySelector<HTMLElement>(`[data-square="${leadingSq}"]`);
    const tileSize = leadingCell?.getBoundingClientRect().width || 60;

    const container = document.createElement('div');
    container.className = 'drag-preview-container';
    Object.assign(container.style, {
      position: 'absolute',
      top: '-9999px',
      left: '-9999px',
      width: `${(maxFile - minFile + 1) * tileSize}px`,
      height: `${(maxRank - minRank + 1) * tileSize}px`,
      pointerEvents: 'none',
      zIndex: '9999',
    });

    for (const sq of group) {
      const p = this.game.getPiece(sq);
      if (!p) continue;
      const fIdx = FILES.indexOf(sq[0]);
      const rIdx = parseInt(sq[1], 10);

      const relX = (fIdx - minFile) * tileSize;
      const relY = (maxRank - rIdx) * tileSize;

      const img = createPieceImg(p.color, p.type);
      Object.assign(img.style, {
        position: 'absolute',
        left: `${relX}px`,
        top: `${relY}px`,
        width: `${tileSize}px`,
        height: `${tileSize}px`,
        opacity: '0.85',
      });
      container.appendChild(img);
    }

    document.body.appendChild(container);

    const leadingFIdx = FILES.indexOf(leadingSq[0]);
    const leadingRIdx = parseInt(leadingSq[1], 10);
    const offsetX = (leadingFIdx - minFile) * tileSize + tileSize / 2;
    const offsetY = (maxRank - leadingRIdx) * tileSize + tileSize / 2;

    event.dataTransfer.setDragImage(container, offsetX, offsetY);
    setTimeout(() => container.remove(), 0);
  }

  private onDragStart(event: DragEvent, square: Square): void {
    if (this.timelineIndex !== this.timeline.length - 1) {
      event.preventDefault();
      return;
    }
    if (!this.isMyTurn()) {
      event.preventDefault();
      return;
    }
    const piece = this.game.getPiece(square);
    if (!piece || piece.color !== this.game.getTurn()) {
      event.preventDefault();
      return;
    }
    this.draggedSquare = square;
    event.dataTransfer?.setData('text/plain', square);
    event.dataTransfer!.effectAllowed = 'move';

    if (this.leadingSquare !== square) {
      this.selectLeading(square);
    }

    if (this.leadingSquare === square && this.followerSquares.size > 0) {
      this.createDragPreview(event, this.leadingSquare, this.followerSquares);
    }
  }

  private onDragOver(event: DragEvent, square: Square): void {
    const from = this.draggedSquare;
    if (!from || from === square || !this.isMyTurn()) return;
    const context =
      this.leadingSquare === from && this.followerSquares.size > 0
        ? { followers: [...this.followerSquares] }
        : undefined;
    const allowed = this.game.getLegalMoves(from, context).some((move) => move.to === square);
    if (allowed) {
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'move';
      (event.currentTarget as HTMLElement).classList.add('drag-over');
    }
  }

  private onDrop(event: DragEvent, to: Square): void {
    event.preventDefault();
    if (!this.isMyTurn()) return;
    const from = this.draggedSquare;
    this.clearDragState();
    if (!from || from === to) return;
    const context =
      this.leadingSquare === from && this.followerSquares.size > 0
        ? { followers: [...this.followerSquares] }
        : undefined;
    if (!this.game.getLegalMoves(from, context).some((move) => move.to === to)) return;
    this.isLastMoveFromDrag = true;
    void this.attemptMove(from, to);
  }

  private clearDragState(): void {
    this.draggedSquare = null;
    this.boardEl
      ?.querySelectorAll('.drag-over')
      .forEach((cell) => cell.classList.remove('drag-over'));
  }

  private showPromotionDialog(color: Color, titleText = 'Превращение пешки'): Promise<PieceType | null> {
    return new Promise((resolve) => {
      const titleEl = this.promotionEl.querySelector('p');
      if (titleEl) titleEl.textContent = titleText;

      const options = this.promotionEl.querySelector('.promotion-options')!;
      options.innerHTML = '';
      this.promotionEl.classList.remove('hidden');

      const pieces: PieceType[] = ['q', 'r', 'b', 'n'];
      for (const type of pieces) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'promotion-piece';
        btn.appendChild(createPieceImg(color, type));
        btn.addEventListener('click', () => {
          this.promotionEl.classList.add('hidden');
          resolve(type);
        });
        options.appendChild(btn);
      }

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn-secondary promotion-cancel';
      cancel.textContent = 'Отмена';
      cancel.addEventListener('click', () => {
        this.promotionEl.classList.add('hidden');
        resolve(null);
      });
      options.appendChild(cancel);
    });
  }

  private onPointerDown(e: PointerEvent, square: Square): void {
    if (e.button !== 0) return;
    if (this.timelineIndex !== this.timeline.length - 1) return;
    if (!this.isMyTurn()) return;
    if (this.game.getResult().status !== 'ongoing') return;
    const piece = this.game.getPiece(square);
    if (!piece || piece.color !== this.game.getTurn()) return;

    this.touchDragFrom = square;
    this.touchDragStartX = e.clientX;
    this.touchDragStartY = e.clientY;
    this.isTouchDragging = false;

    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.touchDragFrom) return;
    const dx = e.clientX - this.touchDragStartX;
    const dy = e.clientY - this.touchDragStartY;

    if (!this.isTouchDragging && Math.hypot(dx, dy) > 7) {
      this.isTouchDragging = true;
      if (this.touchDragFrom && this.leadingSquare !== this.touchDragFrom) {
        this.selectLeading(this.touchDragFrom);
      }
      this.createTouchDragAvatar(this.touchDragFrom, e.clientX, e.clientY);
    }

    if (this.isTouchDragging && this.touchDragAvatar) {
      if (e.cancelable) e.preventDefault();

      const leadingCell = this.boardEl.querySelector<HTMLElement>(`[data-square="${this.touchDragFrom}"]`);
      const tileSize = leadingCell?.getBoundingClientRect().width || 50;

      this.touchDragAvatar.style.left = `${e.clientX - tileSize / 2}px`;
      this.touchDragAvatar.style.top = `${e.clientY - tileSize / 2}px`;

      const elem = document.elementFromPoint(e.clientX, e.clientY);
      const targetCell = elem?.closest<HTMLElement>('.square');
      const targetSquare = targetCell?.dataset.square as Square | undefined;

      this.boardEl.querySelectorAll('.drag-over').forEach((c) => c.classList.remove('drag-over'));
      if (targetSquare && targetSquare !== this.touchDragFrom) {
        const context =
          this.leadingSquare === this.touchDragFrom && this.followerSquares.size > 0
            ? { followers: [...this.followerSquares] }
            : undefined;
        const allowed = this.game.getLegalMoves(this.touchDragFrom, context).some((m) => m.to === targetSquare);
        if (allowed && targetCell) {
          targetCell.classList.add('drag-over');
        }
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);

    if (this.isTouchDragging) {
      this.ignoreNextClick = true;
      if (this.touchDragAvatar) {
        this.touchDragAvatar.remove();
        this.touchDragAvatar = null;
      }
      this.boardEl.querySelectorAll('.drag-over').forEach((c) => c.classList.remove('drag-over'));

      const elem = document.elementFromPoint(e.clientX, e.clientY);
      const targetCell = elem?.closest<HTMLElement>('.square');
      const toSquare = targetCell?.dataset.square as Square | undefined;

      const fromSquare = this.touchDragFrom;
      this.touchDragFrom = null;
      this.isTouchDragging = false;

      if (fromSquare && toSquare && fromSquare !== toSquare) {
        const context =
          this.leadingSquare === fromSquare && this.followerSquares.size > 0
            ? { followers: [...this.followerSquares] }
            : undefined;
        const allowed = this.game.getLegalMoves(fromSquare, context).some((m) => m.to === toSquare);
        if (allowed) {
          this.isLastMoveFromDrag = true;
          void this.attemptMove(fromSquare, toSquare);
        }
      }
    } else {
      this.touchDragFrom = null;
      this.isTouchDragging = false;
    }
  };

  private createTouchDragAvatar(leadingSq: Square, clientX: number, clientY: number): void {
    if (this.touchDragAvatar) {
      this.touchDragAvatar.remove();
      this.touchDragAvatar = null;
    }

    const leadingCell = this.boardEl.querySelector<HTMLElement>(`[data-square="${leadingSq}"]`);
    if (!leadingCell) return;
    const leadingRect = leadingCell.getBoundingClientRect();
    const tileSize = leadingRect.width;

    const followerSqs = this.leadingSquare === leadingSq ? this.followerSquares : new Set<Square>();
    const group = [leadingSq, ...followerSqs];

    const container = document.createElement('div');
    container.className = 'touch-drag-avatar';
    Object.assign(container.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '10000',
      left: `${clientX - tileSize / 2}px`,
      top: `${clientY - tileSize / 2}px`,
      opacity: '0.88',
      filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.55))',
    });

    for (const sq of group) {
      const p = this.game.getPiece(sq);
      if (!p) continue;
      const cell = this.boardEl.querySelector<HTMLElement>(`[data-square="${sq}"]`);
      if (!cell) continue;
      const rect = cell.getBoundingClientRect();

      const relX = rect.left - leadingRect.left;
      const relY = rect.top - leadingRect.top;

      const img = createPieceImg(p.color, p.type);
      Object.assign(img.style, {
        position: 'absolute',
        left: `${relX}px`,
        top: `${relY}px`,
        width: `${tileSize}px`,
        height: `${tileSize}px`,
      });
      container.appendChild(img);
    }

    document.body.appendChild(container);
    this.touchDragAvatar = container;
  }
}
