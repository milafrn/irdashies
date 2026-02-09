import { TeamSharingMessage } from './types';

// Define channel name
const CHANNEL_NAME = 'ird-team-sync-v2';

export class LocalSyncService {
  private channel: BroadcastChannel;
  private onMessageCallbacks: Set<(msg: TeamSharingMessage) => void> = new Set<
    (msg: TeamSharingMessage) => void
  >();

  constructor() {
    this.channel = new BroadcastChannel(CHANNEL_NAME);

    this.channel.onmessage = (event) => {
      const msg = event.data as TeamSharingMessage;
      this.onMessageCallbacks.forEach((cb) => cb(msg));
    };

    // Log for debugging
    // console.log('[LocalSync] Channel created:', CHANNEL_NAME);
  }

  public broadcast(message: TeamSharingMessage) {
    // BroadcastChannel is very fast (structured clone in browser memory)
    // We can safely send objects without JSON.stringify overhead
    try {
      this.channel.postMessage(message);
    } catch (err) {
      console.error('[LocalSync] Broadcast failed:', err);
    }
  }

  public onMessage(callback: (msg: TeamSharingMessage) => void): () => void {
    this.onMessageCallbacks.add(callback);
    return () => this.onMessageCallbacks.delete(callback);
  }

  public close() {
    this.channel.close();
    this.onMessageCallbacks.clear();
  }
}
