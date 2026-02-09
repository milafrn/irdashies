export type TeamSharingMode = 'idle' | 'host' | 'guest';

export interface TeamSharingMessage {
  type:
    | 'telemetry'
    | 'session'
    | 'fuel_history'
    | 'keep_alive'
    | 'request_sync'
    | 'status';
  data: unknown;
}
