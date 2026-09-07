import { GameController, TrailerChessRules } from './core';
import { ChessBoardView } from './ui/ChessBoardView';

const app = document.getElementById('app');
if (!app) throw new Error('Root element #app not found');

const rules = new TrailerChessRules();
const game = new GameController(rules);
const board = new ChessBoardView(app, game);

board.mount();
