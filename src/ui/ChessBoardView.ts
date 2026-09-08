import type { Color, GameController, GameResult, GameSnapshot, Move, PieceType, Square, TrailerOptions } from '../core';
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

  private mode: 'local' | 'online' = 'local';
  private net = new NetworkManager();
  private netErrorMessage: string | null = null;

  private boardEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private historyEl!: HTMLElement;
  private promotionEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private optionsSlotEl!: HTMLElement;
  private timelineStatusEl!: HTMLElement;
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
          <h1>Chess with trailer</h1>
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
                <button type="button" class="btn btn-secondary" data-action="flip">↕ Перевернуть</button>
                <button type="button" class="btn btn-primary" data-action="reset">↺ Новая партия</button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    `;

    this.boardEl = this.container.querySelector('.board')!;
    this.statusEl = this.container.querySelector('.game-status')!;
    this.historyEl = this.container.querySelector('.move-history')!;
    this.promotionEl = this.container.querySelector('.promotion-dialog')!;
    this.hintEl = this.container.querySelector('.selection-hint')!;
    this.optionsSlotEl = this.container.querySelector('.trailer-options-slot')!;
    this.timelineStatusEl = this.container.querySelector('.timeline-status')!;
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
        <button type="button" class="btn btn-secondary btn-sm btn-block reset-options-btn" style="margin-top: 0.6rem;">↺ Сбросить опции</button>
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
    this.timelineStatusEl.textContent =
      this.timelineIndex === this.timeline.length - 1
        ? ''
        : `Просмотр прошлого состояния (${this.timelineIndex}/${this.timeline.length - 1}). Ходы отключены.`;
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
  }

  private showTimeline(index: number): void {
    const next = Math.max(0, Math.min(index, this.timeline.length - 1));
    if (next === this.timelineIndex) return;
    this.timelineIndex = next;
    this.isBrowsingHistory = true;
    try {
      this.game.loadSnapshot(this.timeline[next]);
    } finally {
      this.isBrowsingHistory = false;
    }
    this.clearSelection();
    this.render();
  }

  private getSelectableFollowers(): Square[] {
    if (!this.leadingSquare) return [];
    const opts = this.game.getTrailerOptions();
    const direct = this.game.getProtectors(this.leadingSquare);
    if (!opts?.allowRecursiveGroup || !opts?.allowMultiFollower) {
      return direct;
    }

    const selectable = new Set<Square>(direct);
    for (const follower of this.followerSquares) {
      for (const p of this.game.getProtectors(follower)) {
        if (p !== this.leadingSquare) {
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

  private renderBoard(): void {
    this.boardEl.innerHTML = '';
    const displayFiles = this.flipped ? [...FILES].reverse() : FILES;
    const displayRanks = this.flipped ? [...RANKS].reverse() : RANKS;

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
    const moves = this.game.getSnapshot().moveHistory;
    this.historyEl.innerHTML = '';

    for (let i = 0; i < moves.length; i += 2) {
      const li = document.createElement('li');
      const moveNum = Math.floor(i / 2) + 1;
      const white = moves[i]?.san ?? '';
      const black = moves[i + 1]?.san ?? '';
      li.innerHTML = `<span class="move-num">${moveNum}.</span> ${white} ${black}`;
      this.historyEl.appendChild(li);
    }
  }

  private isMyTurn(): boolean {
    if (this.mode === 'local') return true;
    if (!this.net.isConnected()) return false;
    return this.game.getTurn() === this.net.getMyColor();
  }

  private onSquareClick(square: Square): void {
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

      if (piece && piece.color === turn && square !== this.leadingSquare) {
        const selectable = this.getSelectableFollowers();
        if (selectable.includes(square)) {
          this.toggleFollower(square);
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
      if (piece && piece.color === turn) {
        this.selectLeading(square);
      }
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
    } else {
      if (!opts?.allowMultiFollower) {
        this.followerSquares.clear();
      }
      this.followerSquares.add(square);
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

  private executeMove(
    from: Square,
    to: Square,
    promotion?: PieceType,
    context?: { followers: Square[]; followerPromotions?: Partial<Record<Square, PieceType>> },
  ): void {
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
    if (result.ok) this.animateGroupMove(result.move);
  }

  private animateGroupMove(move: Move): void {
    const shifts = [{ from: move.from, to: move.to }, ...(move.followers ?? [])].filter(
      (shift) => !('removed' in shift && shift.removed),
    );
    for (const shift of shifts) {
      const from = this.boardEl.querySelector<HTMLElement>(`[data-square="${shift.from}"]`);
      const to = this.boardEl.querySelector<HTMLElement>(`[data-square="${shift.to}"]`);
      const piece = to?.querySelector<HTMLImageElement>('.piece-img');
      if (!from || !to || !piece) continue;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const ghost = piece.cloneNode(true) as HTMLImageElement;
      ghost.className = 'piece-img moving-piece';
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
        { duration: 240, easing: 'cubic-bezier(.2,.75,.25,1)' },
      );
      animation.onfinish = () => ghost.remove();
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
}
