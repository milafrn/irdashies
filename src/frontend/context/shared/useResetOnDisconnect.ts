import { useEffect, useRef } from 'react';
import { useSessionStore } from '../SessionStore/SessionStore';
import { useTelemetryStore } from '../TelemetryStore/TelemetryStore';
import { useCarSpeedsStore } from '../CarSpeedStore/CarSpeedsStore';
import { useLapTimesStore } from '../LapTimesStore/LapTimesStore';
import { usePitLapStore } from '../PitLapStore/PitLapStore';
import { useFuelStore } from '../../components/FuelCalculator/FuelStore';
import { useTeamSharing } from '../TeamSharingContext';

/**
 * Resets all session-related stores when the iRacing sim disconnects.
 * Watches for the running state to transition from true to false,
 * then clears stale data so overlays start fresh on the next session.
 */
export const useResetOnDisconnect = (running: boolean) => {
  const prevRunning = useRef(running);
  const { mode } = useTeamSharing();

  useEffect(() => {
    if (prevRunning.current && !running) {
      // ONLY reset if we are NOT a guest.
      // If we are a guest, our data comes from P2P, not the local bridge.
      if (mode !== 'guest') {
        console.log(
          '[useResetOnDisconnect] Sim disconnected, resetting all stores'
        );
        useSessionStore.getState().resetSession();
        useTelemetryStore.getState().resetTelemetry();
        useCarSpeedsStore.getState().resetCarSpeeds();
        useLapTimesStore.getState().reset();
        usePitLapStore.getState().reset();
        useFuelStore.getState().clearAllData();
      } else {
        console.log(
          '[useResetOnDisconnect] Sim disconnected, but skipped reset because Guest mode is active'
        );
      }
    }
    prevRunning.current = running;
  }, [running, mode]);
};
