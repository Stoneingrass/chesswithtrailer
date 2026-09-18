import type { Color, GameSnapshot, Move, TrailerOptions } from '../core';

export type PlayerRole = 'host' | 'guest';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'waiting_for_peer' | 'connected' | 'error';

export interface ClockSettings {
  enabled: boolean;
  initialMinutes: number;
  incrementSeconds: number;
}

export interface RoomSettings {
  lockOptions: boolean;
  clock: ClockSettings;
  preferredColor?: 'w' | 'b' | 'random';
}

export type NetworkMessage =
  | {
      type: 'INIT_GAME';
      snapshot: GameSnapshot;
      options: TrailerOptions;
      hostColor: Color;
      guestColor: Color;
      roomSettings?: RoomSettings;
    }
  | {
      type: 'MOVE';
      move: Move;
      snapshot: GameSnapshot;
      whiteTimeMs?: number;
      blackTimeMs?: number;
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
    }
  | {
      type: 'TAKEBACK_OFFER';
      fromColor: Color;
      undoCount: number;
    }
  | {
      type: 'TAKEBACK_ACCEPT';
      undoCount: number;
    }
  | {
      type: 'TAKEBACK_CANCEL';
    }
  | {
      type: 'DRAW_OFFER';
      fromColor: Color;
    }
  | {
      type: 'DRAW_ACCEPT';
    }
  | {
      type: 'DRAW_REJECT';
    }
  | {
      type: 'DRAW_CANCEL';
    }
  | {
      type: 'RESIGN';
      fromColor: Color;
    }
  | {
      type: 'REMATCH_OFFER';
      fromColor: Color;
    }
  | {
      type: 'REMATCH_ACCEPT';
    }
  | {
      type: 'REMATCH_REJECT';
    }
  | {
      type: 'REMATCH_CANCEL';
    }
  | {
      type: 'TIMEOUT';
      winner: Color;
    };

export interface NetworkEvents {
  statusChange: (status: ConnectionStatus, message?: string) => void;
  message: (msg: NetworkMessage) => void;
  partnerConnected: (assignedColor: Color) => void;
  partnerDisconnected: () => void;
}
