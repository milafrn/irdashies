import { ipcMain } from 'electron';
import { OverlayManager } from '../overlayManager';
import { TeamSharingMode, TeamSharingMessage } from '@irdashies/types';

let currentMode: TeamSharingMode = 'idle';
let currentPeerId: string | undefined;

export function setupTeamSharingBridge(overlayManager: OverlayManager) {
  // Received from the window that is actually running PeerJS
  ipcMain.on(
    'teamsharing:update-status',
    (_, mode: TeamSharingMode, peerId?: string) => {
      currentMode = mode;
      currentPeerId = peerId;

      // Broadcast to ALL windows (including overlays)
      overlayManager.publishMessage('teamsharing:status-changed', {
        mode,
        peerId,
      });
    }
  );

  // Received from the window that is actually running PeerJS (RX data)
  // OR sent by windows that want to broadcast to others (TX data)
  ipcMain.on('teamsharing:broadcast-data', (_, message: TeamSharingMessage) => {
    // console.log(`[TeamSharingBridge] Broadcasting data: ${message.type}`);

    // Forward this message to ALL other windows
    overlayManager.publishMessage('teamsharing:data-received', message);
  });

  // Allow windows to request the current status on startup
  ipcMain.handle('teamsharing:get-status', () => {
    return { mode: currentMode, peerId: currentPeerId };
  });
}
