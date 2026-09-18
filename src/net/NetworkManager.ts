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
  private pingInterval: ReturnType<typeof setInterval> | null = null;

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

  swapColor(): Color | null {
    if (this.myColor === 'w') {
      this.myColor = 'b';
    } else if (this.myColor === 'b') {
      this.myColor = 'w';
    }
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
    this.myColor = Math.random() < 0.5 ? 'w' : 'b';
    this.updateStatus('waiting_for_peer', 'Ожидание второго игрока...');

    return new Promise((resolve, reject) => {
      const peerId = `${ROOM_PREFIX}${code}`;
      this.peer = new Peer(peerId);

      this.peer.on('open', () => {
        resolve(code);
      });

      this.peer.on('error', (err: any) => {
        console.warn('PeerJS Host error:', err);
        let errorMsg = `Ошибка сети: ${err.message || 'Не удалось создать комнату'}`;
        if (err.type === 'unavailable-id') {
          errorMsg = `Код комнаты занят, попробуйте создать комнату заново.`;
        }
        this.updateStatus('error', errorMsg);
        reject(err);
      });

      this.peer.on('connection', (c) => {
        if (this.isConnected()) {
          c.on('open', () => {
            c.send({ type: 'ERROR', message: 'Комната заполнена (уже играют 2 игрока)' });
            setTimeout(() => c.close(), 300);
          });
          return;
        }
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

      this.peer.on('error', (err: any) => {
        console.warn('PeerJS Guest error:', err);
        let errorMsg = `Не удалось подключиться к комнате ${cleanCode}`;
        if (err.type === 'peer-unavailable') {
          errorMsg = `Комната ${cleanCode} не найдена или закрыта. Убедитесь, что создатель в сети.`;
        } else if (err.type === 'network' || err.type === 'server-error') {
          errorMsg = `Ошибка сети при подключении к комнате ${cleanCode}.`;
        }
        this.updateStatus('error', errorMsg);
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
    this.stopPingHeartbeat();
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
      const hostColor = this.myColor ?? 'w';
      const guestColor: Color = hostColor === 'w' ? 'b' : 'w';
      this.sendMessage({
        type: 'INIT_GAME',
        snapshot,
        options,
        hostColor,
        guestColor,
      });
      this.listeners.partnerConnected?.(hostColor);
    });

    this.conn.on('data', (data) => {
      this.handleData(data as NetworkMessage);
    });

    this.conn.on('close', () => {
      this.stopPingHeartbeat();
      this.updateStatus('waiting_for_peer', 'Соперник отключился. Ожидание...');
      this.listeners.partnerDisconnected?.();
    });

    this.conn.on('error', (err) => {
      console.error('Connection error:', err);
      this.stopPingHeartbeat();
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
      this.stopPingHeartbeat();
      this.updateStatus('disconnected', 'Соединение с хостом разорвано');
      this.listeners.partnerDisconnected?.();
    });

    this.conn.on('error', (err) => {
      console.error('Guest connection error:', err);
      this.stopPingHeartbeat();
      this.updateStatus('error', 'Не удалось связаться с комнатой');
      reject(err);
    });
  }

  private handleData(msg: NetworkMessage): void {
    if (msg.type === 'PING') {
      this.sendMessage({ type: 'PONG' });
      return;
    }
    if (msg.type === 'PONG') {
      return;
    }
    this.listeners.message?.(msg);
  }

  private startPingHeartbeat(): void {
    this.stopPingHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.sendMessage({ type: 'PING' });
      }
    }, 5000);
  }

  private stopPingHeartbeat(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private updateStatus(status: ConnectionStatus, message?: string): void {
    this.status = status;
    if (status === 'connected') {
      this.startPingHeartbeat();
    } else if (status === 'disconnected' || status === 'error') {
      this.stopPingHeartbeat();
    }
    this.listeners.statusChange?.(status, message);
  }
}
