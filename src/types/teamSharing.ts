export type TeamSharingMode = 'idle' | 'host' | 'guest';

export interface TeamSharingMessage {
  type:
    | 'telemetry'
    | 'session'
    | 'fuel_history'
    | 'keep_alive'
    | 'request_sync';
  data: unknown;
}

export interface TeamSharingBridge {
  onStatusChange: (
    callback: (mode: TeamSharingMode, peerId?: string) => void
  ) => () => void;
  onData: (callback: (message: TeamSharingMessage) => void) => () => void;
  updateStatus: (mode: TeamSharingMode, peerId?: string) => void;
  broadcastData: (message: TeamSharingMessage) => void;
  getStatus: () => Promise<{ mode: TeamSharingMode; peerId?: string }>;
}
