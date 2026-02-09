import Peer, { DataConnection } from 'peerjs';
import { TeamSharingMessage } from './types';

export class RemoteSyncService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map<
    string,
    DataConnection
  >();
  private pendingConnections: Set<string> = new Set<string>();

  private onDataCallbacks: Set<(msg: TeamSharingMessage) => void> = new Set<
    (msg: TeamSharingMessage) => void
  >();
  private onPeerConnectedCallbacks: Set<(peerId: string) => void> = new Set<
    (peerId: string) => void
  >();
  private onStatusChangeCallbacks: Set<
    (status: 'connected' | 'disconnected', id?: string) => void
  > = new Set<(status: 'connected' | 'disconnected', id?: string) => void>();

  public startHosting(forcedId?: string, onId?: (id: string) => void) {
    this.stop(); // Clear previous

    this.peer = forcedId ? new Peer(forcedId) : new Peer();

    this.peer.on('open', (id) => {
      onId?.(id);
      this.notifyStatus('connected', id);
    });

    this.peer.on('connection', (conn) => {
      this.setupConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error('[RemoteSync] Peer Error:', err);
      this.notifyStatus('disconnected');
    });
  }

  public joinSession(hostId: string) {
    this.stop();

    this.peer = new Peer();

    this.peer.on('open', (id) => {
      const conn = this.peer?.connect(hostId);
      if (conn) {
        this.setupConnection(conn);
      }
      this.notifyStatus('connected', id);
    });

    this.peer.on('error', (err) => {
      console.error('[RemoteSync] Join Error:', err);
      this.notifyStatus('disconnected');
    });
  }

  private setupConnection(conn: DataConnection) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.pendingConnections.delete(conn.peer);
      this.notifyPeerConnected(conn.peer);
    });

    conn.on('data', (data: unknown) => {
      const msg = data as TeamSharingMessage;
      this.onDataCallbacks.forEach((cb) => cb(msg));
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
    });

    conn.on('error', (err) => {
      console.error('[RemoteSync] Connection Error:', err);
      this.connections.delete(conn.peer);
    });
  }

  public broadcast(message: TeamSharingMessage) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(message);
      }
    });
  }

  public stop() {
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();

    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.notifyStatus('disconnected');
  }

  public getPeerId(): string | undefined {
    return this.peer?.id;
  }

  public onData(cb: (msg: TeamSharingMessage) => void): () => void {
    this.onDataCallbacks.add(cb);
    return () => this.onDataCallbacks.delete(cb);
  }

  public onStatusChange(
    cb: (status: 'connected' | 'disconnected', id?: string) => void
  ): () => void {
    this.onStatusChangeCallbacks.add(cb);
    return () => this.onStatusChangeCallbacks.delete(cb);
  }

  public onPeerConnected(cb: (peerId: string) => void): () => void {
    this.onPeerConnectedCallbacks.add(cb);
    return () => this.onPeerConnectedCallbacks.delete(cb);
  }

  private notifyStatus(status: 'connected' | 'disconnected', id?: string) {
    this.onStatusChangeCallbacks.forEach((cb) => cb(status, id));
  }

  private notifyPeerConnected(peerId: string) {
    this.onPeerConnectedCallbacks.forEach((cb) => cb(peerId));
  }
}
