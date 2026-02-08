import Peer, { DataConnection } from 'peerjs';

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

class TeamSharingManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map<
    string,
    DataConnection
  >();
  private pendingConnections: Set<string> = new Set<string>();
  private mode: TeamSharingMode = 'idle';
  private remoteMode: TeamSharingMode = 'idle';
  private remotePeerId: string | undefined;
  private onDataCallbacks: Set<(message: TeamSharingMessage) => void> = new Set<
    (message: TeamSharingMessage) => void
  >();
  private onStatusChangeCallbacks: Set<
    (mode: TeamSharingMode, peerId?: string) => void
  > = new Set<(mode: TeamSharingMode, peerId?: string) => void>();
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private isInitialSyncDone = false;

  constructor() {
    this.setupBridgeListeners();
  }

  private async setupBridgeListeners() {
    if (typeof window === 'undefined' || !window.teamSharingBridge) return;

    // 1. Get initial status from backend
    try {
      const status = await window.teamSharingBridge.getStatus();
      this.remoteMode = status.mode;
      this.remotePeerId = status.peerId;
      this.notifyStatus();
    } catch (err) {
      console.error('[TeamSharing] Failed to get initial status:', err);
    }

    // 2. Listen for status changes from OTHER windows
    window.teamSharingBridge.onStatusChange((mode, peerId) => {
      this.remoteMode = mode;
      this.remotePeerId = peerId;
      // CRITICAL FIX: Do NOT broadcast back to bridge, or we create an infinite loop!
      this.notifyStatus(undefined, false);
    });

    // 3. Listen for data from OTHER windows
    window.teamSharingBridge.onData((msg) => {
      // Trigger local callbacks but EXCLUDE bridge broadcast to avoid loops
      this.onDataCallbacks.forEach((cb) => cb(msg));
    });

    this.isInitialSyncDone = true;
  }

  public getMode(): TeamSharingMode {
    // If we have a local active mode, prefer it; otherwise use bridge mode
    return this.mode !== 'idle' ? this.mode : this.remoteMode;
  }

  public getPeerId(): string | undefined {
    return this.peer?.id || this.remotePeerId;
  }

  public isLocalHost(): boolean {
    return this.mode === 'host';
  }

  public startHosting(
    forcedId?: string,
    onPeerIdGenerated?: (id: string) => void
  ): void {
    if (this.peer && !this.peer.destroyed) {
      if (
        this.mode === 'host' &&
        (forcedId === undefined || forcedId === this.peer.id)
      ) {
        return; // Already hosting or connecting with same ID
      }
      this.stop();
    }

    this.mode = 'host';
    this.notifyStatus(); // Notify immediately that we are trying to host
    this.peer = forcedId ? new Peer(forcedId) : new Peer();

    this.peer.on('open', (id) => {
      onPeerIdGenerated?.(id);
      this.notifyStatus(id);

      this.startKeepAlive();
    });

    this.peer.on('connection', (conn) => {
      this.setupConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error('[TeamSharing] Peer Error:', err);
      this.stop();
    });
  }

  public joinSession(hostId: string): void {
    if (this.peer && !this.peer.destroyed) {
      // Check if we are already trying to connect or connected to this host
      if (
        this.mode === 'guest' &&
        (this.connections.has(hostId) ||
          this.pendingConnections.has(hostId) ||
          this.peer.open === false)
      ) {
        return;
      }
      this.stop();
    }

    this.mode = 'guest';
    this.pendingConnections.add(hostId);
    this.notifyStatus(); // Notify immediately that we are trying to join
    this.peer = new Peer();

    this.peer.on('open', (id) => {
      const conn = this.peer?.connect(hostId);
      if (conn) {
        this.setupConnection(conn);
      }
      this.notifyStatus(id);
    });

    this.peer.on('error', (err) => {
      console.error('[TeamSharing] Join Peer Error:', err);
      this.stop();
    });
  }

  private setupConnection(conn: DataConnection): void {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.pendingConnections.delete(conn.peer);
      this.notifyPeerConnected(conn.peer);
    });

    conn.on('data', (data: unknown) => {
      const msg = data as TeamSharingMessage;

      // 1. Notify local subscribers
      this.onDataCallbacks.forEach((cb) => cb(msg));

      // 2. Broadcast to other windows via bridge
      if (typeof window !== 'undefined' && window.teamSharingBridge) {
        window.teamSharingBridge.broadcastData(msg);
      }
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.pendingConnections.delete(conn.peer);
    });

    conn.on('error', (err) => {
      console.error('[TeamSharing] Connection Error:', err);
      this.connections.delete(conn.peer);
      this.pendingConnections.delete(conn.peer);
    });
  }

  public broadcast(message: TeamSharingMessage): void {
    if (this.getMode() !== 'host') return;

    // If we are the local host, send via PeerJS
    if (this.mode === 'host') {
      this.connections.forEach((conn) => {
        if (conn.open) {
          conn.send(message);
        }
      });
    }

    // Also broadcast to other windows (so their UI updates if they show host stats)
    if (typeof window !== 'undefined' && window.teamSharingBridge) {
      window.teamSharingBridge.broadcastData(message);
    }
  }

  public sendToHost(message: TeamSharingMessage): void {
    if (this.getMode() !== 'guest') return;

    // If we are the local guest, send via PeerJS
    if (this.mode === 'guest') {
      this.connections.forEach((conn) => {
        if (conn.open) {
          conn.send(message);
        }
      });
    }

    // Also broadcast to other windows via bridge
    if (typeof window !== 'undefined' && window.teamSharingBridge) {
      window.teamSharingBridge.broadcastData(message);
    }
  }

  public stop(): void {
    const wasActive = this.mode !== 'idle';

    if (this.mode === 'idle' && !this.peer) return;

    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    this.pendingConnections.clear();
    this.stopKeepAlive();

    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.mode = 'idle';
    this.remoteMode = 'idle'; // CRITICAL FIX: Ensure getMode() returns idle immediately

    if (wasActive) {
      this.notifyStatus();
    }
  }

  public onData(callback: (message: TeamSharingMessage) => void): () => void {
    this.onDataCallbacks.add(callback);
    return () => this.onDataCallbacks.delete(callback);
  }

  public onStatusChange(
    callback: (mode: TeamSharingMode, peerId?: string) => void
  ): () => void {
    this.onStatusChangeCallbacks.add(callback);
    // CRITICAL: Call immediately with current state to ensure subscribers are in sync
    callback(this.getMode(), this.getPeerId());
    return () => this.onStatusChangeCallbacks.delete(callback);
  }

  private notifyStatus(peerId?: string, broadcastToBridge = true): void {
    const id = peerId || this.getPeerId();
    const currentMode = this.getMode();

    // 1. Update local subscribers
    this.onStatusChangeCallbacks.forEach((cb) => cb(currentMode, id));

    // 2. Update backend bridge
    // We notify if:
    // - We are active (host/guest)
    // - OR we just became idle (to sync other windows)
    // - AND we are allowed to broadcast (not responding to an incoming broadcast)
    if (
      broadcastToBridge &&
      typeof window !== 'undefined' &&
      window.teamSharingBridge
    ) {
      window.teamSharingBridge.updateStatus(currentMode, id);
    }
  }

  private onPeerConnectedCallbacks: Set<(peerId: string) => void> = new Set<
    (peerId: string) => void
  >();

  public onPeerConnected(callback: (peerId: string) => void): () => void {
    this.onPeerConnectedCallbacks.add(callback);
    return () => this.onPeerConnectedCallbacks.delete(callback);
  }

  private notifyPeerConnected(peerId: string): void {
    this.onPeerConnectedCallbacks.forEach((cb) => cb(peerId));
  }

  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (this.getMode() === 'host') {
        this.broadcast({ type: 'keep_alive', data: Date.now() });
      }
    }, 5000); // Send keep-alive every 5 seconds
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
}

export const teamSharingManager = new TeamSharingManager();
