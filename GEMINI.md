# GEMINI.md — Контекст и архитектура проекта Omnichess

## Описание проекта

**Omnichess («Chess with trailer» / «Шахматы с прицепом»)** — веб-приложение для игры в кастомный шахматный вариант «Шахматы с прицепом». 

Основная механика варианта:
- Игрок выбирает **ведущую фигуру** и делает ей ход по правилам шахмат.
- Любые свои фигуры, непосредственно защищающие ведущую (или находящиеся в рекурсивной цепи защиты), могут быть выбраны как **ведомые («прицеп»)**.
- При ходе ведущей фигуры все выбранные ведомые автоматически смещаются на тот же вектор `(Δx, Δy)`.
- Поддерживается как локальный режим, так и P2P игра по сети через PeerJS (WebRTC).

---

## Стек технологий

- **Язык**: TypeScript (ESM)
- **Сборщик**: Vite
- **Шахматный движок**: `chess.js` (как базовый валидатор стандартных ходов и FEN)
- **Сеть**: PeerJS (WebRTC P2P)

---

## Команды проекта

- `npm run dev` — запуск локального сервера разработки Vite.
- `npm run build` — проверка типов TypeScript (`tsc`) и сборка бандла (`vite build`).
- `npm run preview` — просмотр собранного проекта.

---

## Структура проекта и карта модулей

```
omnichess/
├── index.html                  # Главный HTML файл
├── package.json                # Зависимости и скрипты
├── tsconfig.json               # Настройки TypeScript
├── vite.config.ts              # Конфигурация Vite
└── src/
    ├── main.ts                 # Точка входа приложения
    ├── styles.css              # Главный CSS файл (импортирует модульные CSS)
    │
    ├── core/                   # Ядро логики и правил
    │   ├── types.ts            # Базовые типы (Square, Piece, Move, GameSnapshot, GameResult, MoveContext)
    │   ├── boardUtils.ts       # Векторная математика и работа с доской (addDelta, getDelta, getPathSquares)
    │   ├── GameController.ts   # Контроллер партии (история, снимки, undo, сдача, ничья)
    │   │
    │   ├── rules/              # Режимы и наборы правил
    │   │   ├── RuleSet.ts              # Интерфейс набора правил
    │   │   ├── StandardChessRules.ts   # Стандартные шахматы на базе chess.js
    │   │   ├── TrailerCapabilities.ts # Интерфейс возможностей прицепа + type guard isTrailerRules
    │   │   └── TrailerChessRules.ts    # Главный класс-оркестратор правил прицепа
    │   │
    │   └── trailer/            # Вспомогательные модули правил прицепа
    │       ├── types.ts                # TrailerOptions, PlannedFollower, загрузка/сохранение опций
    │       ├── protectors.ts           # Расчет прямых и рекурсивных защитников
    │       ├── castling.ts             # Логика связанных полей и деталей рокировки
    │       ├── pseudoLegal.ts          # Генерация псевдо-легальных ходов
    │       ├── validateTrailerMove.ts  # Валидация цепочек ходов и траекторий ведомых
    │       ├── applyTrailerMove.ts     # Применение ходов, сдвиги ведомых и SAN-нотация
    │       └── kingSafety.ts           # Проверка шаха и безопасности ходов группы
    │
    ├── net/                    # Сетевой слой P2P (PeerJS)
    │   ├── types.ts            # Типы сетевых сообщений (NetworkMessage)
    │   └── NetworkManager.ts   # Менеджер подключений и комнат
    │
    ├── ui/                     # Интерфейс пользователя
    │   ├── ChessBoardView.ts     # Главный UI-композитор (связывает доску, панели и сеть)
    │   ├── BoardSessionState.ts  # Контейнер UI-состояния (выделения, drag/touch, таймлайн)
    │   ├── modeSwitch.ts         # Переключение режимов (local / online)
    │   ├── pieceAssets.ts        # Генерация SVG фигур
    │   │
    │   ├── layout/               # Разметка экрана (gameLayout.ts)
    │   ├── help/                 # Модальное окно правил (helpModal.ts)
    │   ├── panels/               # Панели UI (statusPanel, historyPanel, historyNav, gameActionsPanel, netRoomPanel, trailerOptionsPanel)
    │   ├── board/                # Рендеринг и ввод (renderBoard, selection, dragDrop, touchDrag, promotionDialog, moveAnimator)
    │   ├── net/                  # Управление сетевой сессией UI (onlineSession.ts)
    │   └── persist/              # Сохранение/загрузка состояния в localStorage (gameStateStorage.ts)
    │
    └── styles/                 # Модульные стили CSS
        ├── base.css              # Сброс стилей, переменные, макет
        ├── board.css             # Доска, клетки, фигуры, анимации
        ├── panels.css            # Панели статуса, истории, опций, действия
        ├── network.css           # Сетевая комната и статусы
        ├── help.css              # Модалка справки
        └── responsive.css        # Медиа-запросы
```

---

## Архитектурные принципы codebase

1. **Разделение ответственности**: Файлы декомпозированы на независимые модули целевым размером **150–400 строк**.
2. **Строгая типизация без `as any`**: Контроллер `GameController` взаимодействует с специфичными методами прицепа через type guard `isTrailerRules(rules)`.
3. **Изоляция UI и правил**: `TrailerChessRules` не зависит от DOM/UI. UI читает состояние правил и посылает команды через `GameController`.
4. **Снимок состояния (GameSnapshot)**: Состояние партии описывается сериализуемым `GameSnapshot` (FEN + история ходов + результат), что гарантирует надежную синхронизацию по сети и просмотр истории.
