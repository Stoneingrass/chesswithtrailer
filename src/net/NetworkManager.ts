import { Peer, type DataConnection } from 'peerjs';
import type { Color, GameSnapshot, TrailerOptions } from '../core';
import type { ConnectionStatus, NetworkEvents, NetworkMessage, PlayerRole } from './types';

const ROOM_PREFIX = 'omnichess-room-';

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class NetworkManager {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private status: ConnectionStatus = 'disconnected';
  private role: PlayerRole | null = null;
  private myColor: Color | null = null;
  private roomCode: string | null = null;

  private listeners: Partial<NetworkEvents> = {};

  on<K extends keyof NetworkEvents>(event: K, fn: NetworkEvents[K]): void {
    this.listeners[event] = fn;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getRole(): PlayerRole | null {
    return this.role;
  }

  getMyColor(): Color | null {
    return this.myColor;
  }

  getRoomCode(): string | null {
    return this.roomCode;
  }

  isConnected(): boolean {
    return this.status === 'connected' && this.conn !== null && this.conn.open;
  }

  async createRoom(getInitialState: () => { snapshot: GameSnapshot; options: TrailerOptions }): Promise<string> {
    this.disconnect();
    const code = generateRoomCode();
    this.roomCode = code;
    this.role = 'host';
    this.myColor = 'w';
    this.updateStatus('waiting_for_peer', 'Ожидание второго игрока...');

    return new Promise((resolve, reject) => {
      const peerId = `${ROOM_PREFIX}${code}`;
      this.peer = new Peer(peerId);

      this.peer.on('open', () => {
        resolve(code);
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS Host error:', err);
        this.updateStatus('error', `Ошибка сети: ${err.message}`);
        reject(err);
      });

      this.peer.on('connection', (c) => {
        this.conn = c;
        this.setupConnection(getInitialState);
      });
    });
  }

  async joinRoom(code: string): Promise<void> {
    this.disconnect();
    const cleanCode = code.trim().toUpperCase();
    this.roomCode = cleanCode;
    this.role = 'guest';
    this.myColor = 'b';
    this.updateStatus('connecting', 'Подключение к комнате...');

    return new Promise((resolve, reject) => {
      this.peer = new Peer();

      this.peer.on('open', () => {
        const peerId = `${ROOM_PREFIX}${cleanCode}`;
        this.conn = this.peer!.connect(peerId);
        this.setupGuestConnection(resolve, reject);
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS Guest error:', err);
        this.updateStatus('error', `Не удалось подключиться к комнате ${cleanCode}`);
        reject(err);
      });
    });
  }

  sendMessage(msg: NetworkMessage): void {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    }
  }

  disconnect(): void {
    if (this.conn) {
      try {
        this.conn.close();
      } catch {}
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
    this.role = null;
    this.myColor = null;
    this.roomCode = null;
    this.updateStatus('disconnected');
  }

  private setupConnection(getInitialState: () => { snapshot: GameSnapshot; options: TrailerOptions }): void {
    if (!this.conn) return;

    this.conn.on('open', () => {
      this.updateStatus('connected');
      const { snapshot, options } = getInitialState();
      this.sendMessage({
        type: 'INIT_GAME',
        snapshot,
        options,
        hostColor: 'w',
        guestColor: 'b',
      });
      this.listeners.partnerConnected?.('w');
    });

    this.conn.on('data', (data) => {
      this.handleData(data as NetworkMessage);
    });

    this.conn.on('close', () => {
      this.updateStatus('waiting_for_peer', 'Соперник отключился. Ожидание...');
      this.listeners.partnerDisconnected?.();
    });

    this.conn.on('error', (err) => {
      console.error('Connection error:', err);
      this.updateStatus('error', 'Ошибка соединения с соперником');
    });
  }

  private setupGuestConnection(resolve: () => void, reject: (err: unknown) => void): void {
    if (!this.conn) return;

    this.conn.on('open', () => {
      this.updateStatus('connected');
      resolve();
    });

    this.conn.on('data', (data) => {
      const msg = data as NetworkMessage;
      if (msg.type === 'INIT_GAME') {
        this.myColor = msg.guestColor;
        this.listeners.partnerConnected?.(msg.guestColor);
      }
      this.handleData(msg);
    });

    this.conn.on('close', () => {
      this.updateStatus('disconnected', 'Соединение с хостом разорвано');
      this.listeners.partnerDisconnected?.();
    });

    this.conn.on('error', (err) => {
      console.error('Guest connection error:', err);
      this.updateStatus('error', 'Не удалось связаться с комнатой');
      reject(err);
    });
  }

  private handleData(msg: NetworkMessage): void {
    this.listeners.message?.(msg);
  }

  private updateStatus(status: ConnectionStatus, message?: string): void {
    this.status = status;
    this.listeners.statusChange?.(status, message);
  }
}
