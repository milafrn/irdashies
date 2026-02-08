import { useEffect, useState } from 'react';
import { useTeamSharing } from '../context/TeamSharingContext';
import {
  useLocalIsOnTrack,
  useLocalSessionId,
  useLocalTeamId,
  useLocalPlayerCarIdx,
  useLocalIsTeamRacing,
} from '../context/TelemetryStore/LocalTelemetryStore';

export const useAutoTeamSync = () => {
  const { mode, startHosting, joinSession, stop } = useTeamSharing();

  // Settings - could be moved to a persistent store later
  const [isEnabled, setEnabled] = useState(() => {
    return localStorage.getItem('p2p_auto_sync') === 'true';
  });

  const sessionId = useLocalSessionId();
  const playerCarIdx = useLocalPlayerCarIdx();
  const teamId = useLocalTeamId();
  const isOnTrack = useLocalIsOnTrack();
  const isTeamRacing = useLocalIsTeamRacing();

  const toggleAutoSync = () => {
    const newVal = !isEnabled;
    setEnabled(newVal);
    localStorage.setItem('p2p_auto_sync', String(newVal));
    if (!newVal) {
      stop();
    }
  };

  useEffect(() => {
    if (!isEnabled || !sessionId || playerCarIdx === -1 || !isTeamRacing)
      return;

    if (!teamId || teamId === 0) return;

    const roomId = `ird-team-${sessionId}-${teamId}`;

    // Logic:
    // If I'm on track, I should be the HOST.
    // If I'm NOT on track, I should be a GUEST.

    if (isOnTrack === 1) {
      if (mode !== 'host') {
        console.log('[AutoSync] Promoting to HOST for room:', roomId);
        startHosting(roomId);
      }
    } else {
      if (mode !== 'guest') {
        console.log(
          '[AutoSync] Joining as GUEST for room:',
          roomId,
          '(Not on track)'
        );
        joinSession(roomId);
      }
    }
  }, [
    isEnabled,
    sessionId,
    playerCarIdx,
    teamId,
    isOnTrack,
    isTeamRacing,
    mode,
    startHosting,
    joinSession,
  ]);

  return {
    isEnabled,
    toggleAutoSync,
  };
};
