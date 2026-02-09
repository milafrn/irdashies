import { LocalSyncService } from './LocalSync';
import { RemoteSyncService } from './RemoteSync';
import { TeamSharingMode, TeamSharingMessage } from './types';
import { Telemetry, Session } from '@irdashies/types';

// Reusing types from previous implementation or redefining them here
// For now, let's assume we can reuse the type defs from valid imports or redefine if needed.

export class TeamSharingService {
  private localSync: LocalSyncService;
  private remoteSync: RemoteSyncService;

  private mode: TeamSharingMode = 'idle';
  private onStatusChangeCallbacks: Set<
    (mode: TeamSharingMode, peerId?: string) => void
  > = new Set<(mode: TeamSharingMode, peerId?: string) => void>();
  private onDataCallbacks: Set<(msg: TeamSharingMessage) => void> = new Set<
    (msg: TeamSharingMessage) => void
  >();

  private broadcastInterval: NodeJS.Timeout | null = null;

  // Lazy Processing Buffer
  private currentTelemetry: Telemetry | null = null;
  private currentSession: Session | null = null;
  private lastSessionBroadcast = 0;

  constructor() {
    this.localSync = new LocalSyncService();
    this.remoteSync = new RemoteSyncService();

    // 1. Listen to Local Sync (from other windows)
    this.localSync.onMessage((msg) => {
      // If we are IDLE or GUEST, we might be receiving data from a local Host window??
      // Actually, if we are 'idle' but receive data on local bus, it means another window is HOST.
      // We should treat this as 'data received' for overlays.
      this.handleIncomingData(msg);

      // If we are GUEST, we might receive commands?
    });

    // 2. Listen to Remote Sync (from teammates)
    this.remoteSync.onData((msg) => {
      // Data received from INTERNET (PeerJS)
      // 1. Notify local logic (hooks etc)
      this.handleIncomingData(msg);
      // 2. Relay to Local Bus (Sync other windows)
      // CRITICAL: Only relay if WE are the primary connection holder?
      // Yes, if we are Guest, we bridge the data to local windows.
      this.localSync.broadcast(msg);
    });

    this.remoteSync.onStatusChange((status) => {
      // Status from PeerJS
      // We rely on our internal mode, but if Peer disconnects unexpectedly...
      if (status === 'disconnected' && this.mode !== 'idle') {
        // If connection drops, we might want to stop or retry
        // For now, just log or notify
      }
    });
  }

  // --- PUBLIC API ---

  public getMode(): TeamSharingMode {
    return this.mode;
  }

  public getPeerId(): string | undefined {
    return this.remoteSync.getPeerId();
  }

  public isLocalHost(): boolean {
    return this.mode === 'host';
  }

  public startHosting(forcedId?: string, onId?: (id: string) => void) {
    if (this.mode === 'host') return;
    this.stop();

    this.mode = 'host';
    this.notifyStatus();

    this.remoteSync.startHosting(forcedId, (id) => {
      onId?.(id);
      this.notifyStatus(); // ID updated
      this.startBroadcastLoop(); // START LOOP
    });
  }

  public joinSession(hostId: string) {
    if (this.mode === 'guest') return;
    this.stop();

    this.mode = 'guest';
    this.notifyStatus();

    this.remoteSync.joinSession(hostId);
  }

  public stop() {
    this.mode = 'idle';
    this.stopBroadcastLoop();
    this.remoteSync.stop();
    this.currentTelemetry = null;
    this.currentSession = null;
    this.notifyStatus();
  }

  public onData(cb: (msg: TeamSharingMessage) => void): () => void {
    this.onDataCallbacks.add(cb);
    return () => this.onDataCallbacks.delete(cb);
  }

  public onStatusChange(
    cb: (mode: TeamSharingMode, id?: string) => void
  ): () => void {
    this.onStatusChangeCallbacks.add(cb);
    cb(this.mode, this.getPeerId()); // Immediate callback
    return () => this.onStatusChangeCallbacks.delete(cb);
  }

  // --- DATA INGESTION (Fast Path) ---

  public updateTelemetry(data: Telemetry) {
    if (this.mode !== 'host') return;
    this.currentTelemetry = data;
  }

  public updateSession(data: Session) {
    if (this.mode !== 'host') return;
    this.currentSession = data;
  }

  public broadcastManual(msg: TeamSharingMessage) {
    // For manual events like 'Sync History'
    if (this.mode === 'host') {
      this.remoteSync.broadcast(msg);
      this.localSync.broadcast(msg); // also update local windows
    }
  }

  // --- INTERNAL LOOP (Slow Path - 5Hz) ---

  private startBroadcastLoop() {
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    this.broadcastInterval = setInterval(() => this.broadcastCycle(), 200);
  }

  private stopBroadcastLoop() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  private broadcastCycle() {
    if (this.mode !== 'host') return;

    // 1. Process Telemetry
    if (this.currentTelemetry) {
      const cleanData = this.processTelemetry(this.currentTelemetry);
      const msg: TeamSharingMessage = { type: 'telemetry', data: cleanData };

      // 1. Send to Remote (Network)
      this.remoteSync.broadcast(msg);

      // 2. Send to Local (BroadcastChannel) -> For other windows
      // NOTE: Does the main window need this? TelemetryProvider in other windows will pick it up.
      // Wait, if we are Host, local windows ALREADY have TelemetryProvider running!
      // So we strictly DO NOT need to sync telemetry locally if every window has an SDK connection.
      // BUT, maybe Overlay windows don't have SDK?
      // In this app, EVERY window has irsdkBridge. So local sync for Host is redundant for Telemetry!
      // We only need LocalSync for 'Guest' mode, or for 'Session State' that purely logic-based.
      // Let's be safe: If every window has SDK, we don't need local broadcast for टेलीmetry.
      // Result: We skip localSync.broadcast(msg) for Host Telemetry to save even more CPU.
    }

    // 2. Process Session
    const now = Date.now();
    if (this.currentSession && now - this.lastSessionBroadcast >= 2000) {
      const cleanSession = this.processSession(this.currentSession);
      const msg: TeamSharingMessage = { type: 'session', data: cleanSession };
      this.remoteSync.broadcast(msg);
      // Again, skip local sync if windows have SDK.
      this.lastSessionBroadcast = now;
    }
  }

  private handleIncomingData(msg: TeamSharingMessage) {
    this.onDataCallbacks.forEach((cb) => cb(msg));
  }

  private notifyStatus() {
    const id = this.getPeerId();
    this.onStatusChangeCallbacks.forEach((cb) => cb(this.mode, id));

    // We can also broadcast status on local bus so other windows know we are hosting
    // This replaces the 'bridge.updateStatus' logic
    // this.localSync.broadcast({ type: 'status', data: { mode: this.mode, peerId: id } });
  }

  // --- DATA PROCESSING (Moved from Provider) ---

  private processTelemetry(raw: Telemetry): Partial<Telemetry> {
    const filtered: Partial<Telemetry> = {};
    const whitelist = [
      'FuelLevel',
      'FuelLevelPct',
      'Lap',
      'LapDistPct',
      'SessionLapsRemain',
      'SessionTimeRemain',
      'SessionTimeTotal',
      'SessionFlags',
      'SessionTime',
      'SessionNum',
      'SessionState',
      'SessionLaps',
      'SessionLapsTotal',
      'SessionTotalLaps',
      'OnPitRoad',
      'IsOnTrack',
      'DriverCarIdx',
      'TeamID',
      'Speed',
      'RPM',
      'Gear',
      'LapBestLapTime',
      'LapLastLapTime',
      'LapCurrentLapTime',
      'SessionUniqueID',
      'CamCarIdx',
      'DriverCarFuelMaxLtr',
      'DriverCarMaxFuelPct',
      'CarIdxLap',
      'CarIdxLapDistPct',
      'CarIdxOnPitRoad',
      'CarsIdxLastLapTime',
      'AirTemp',
      'TrackTemp',
      'RelativeHumidity',
      'AirPressure',
      'WindVel',
      'WindDir',
      'CarIdxPosition',
      'CarIdxClassPosition',
      'CarIdxEstTime',
      'PlayerCarTowTime',
    ];

    whitelist.forEach((key) => {
      const rawValue = raw[key as keyof Telemetry];
      if (rawValue !== undefined) {
        const value = this.unwrap(rawValue);
        (filtered as Record<string, unknown>)[key] = value;
      }
    });

    // Normalize Session Laps
    if ((filtered as Record<string, unknown>).SessionLaps === undefined) {
      const t = raw as Record<string, unknown>;
      const altTotal = t.SessionLapsTotal || t.SessionTotalLaps;
      if (altTotal !== undefined) {
        (filtered as Record<string, unknown>).SessionLaps = altTotal;
      }
    }

    return filtered;
  }

  private processSession(raw: Session): Partial<Session> {
    return {
      WeekendInfo: raw.WeekendInfo,
      DriverInfo: raw.DriverInfo
        ? {
            ...raw.DriverInfo,
            Drivers: raw.DriverInfo.Drivers?.slice(0, 100),
          }
        : undefined,
      SessionInfo: raw.SessionInfo,
    };
  }

  private unwrap(val: unknown, depth = 0): unknown {
    if (depth > 5) return val;
    if (val === undefined || val === null) return undefined;

    if (typeof val !== 'object') return val;

    if ('value' in (val as Record<string, unknown>)) {
      return this.unwrap((val as { value: unknown }).value, depth + 1);
    }

    if (Array.isArray(val) && val.length > 0) {
      return this.unwrap(val[0], depth + 1);
    }

    return val;
  }
}

export const teamSharingService = new TeamSharingService();
