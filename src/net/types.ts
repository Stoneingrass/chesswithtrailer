import type { Color, GameSnapshot, Move, TrailerOptions } from '../core';

export type PlayerRole = 'host' | 'guest';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'waiting_for_peer' | 'connected' | 'error';

export type NetworkMessage =
  | {
      type: 'INIT_GAME';
      snapshot: GameSnapshot;
      options: TrailerOptions;
      hostColor: Color;
      guestColor: Color;
    }
  | {
      type: 'MOVE';
      move: Move;
      snapshot: GameSnapshot;
    }
  | {
      type: 'CHANGE_OPTIONS';
      options: Partial<TrailerOptions>;
    }
  | {
      type: 'RESET_GAME';
      snapshot: GameSnapshot;
    }
  | {
      type: 'ERROR';
      message: string;
    }
  | {
      type: 'PING';
    }
  | {
      type: 'PONG';
    };

export interface NetworkEvents {
  statusChange: (status: ConnectionStatus, message?: string) => void;
  message: (msg: NetworkMessage) => void;
  partnerConnected: (assignedColor: Color) => void;
  partnerDisconnected: () => void;
}
