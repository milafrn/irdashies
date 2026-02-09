import type { IrSdkBridge, Session } from '@irdashies/types';
import { useTelemetryStore } from './TelemetryStore';
import { useSessionStore } from '../SessionStore/SessionStore';
import { useLocalTelemetryStore } from './LocalTelemetryStore';
import { useFuelStore } from '../../components/FuelCalculator/FuelStore';
import { useEffect, useRef } from 'react';
import { useTeamSharing } from '../TeamSharingContext';
import { teamSharingService } from '../../services/TeamSharing/TeamSharingService';

export interface TelemetryProviderProps {
  bridge: IrSdkBridge | Promise<IrSdkBridge>;
}

export const TelemetryProvider = ({ bridge }: TelemetryProviderProps) => {
  const setTelemetry = useTelemetryStore((state) => state.setTelemetry);
  const setSession = useSessionStore((state) => state.setSession);
  const setLocalTelemetry = useLocalTelemetryStore(
    (state) => state.setLocalTelemetry
  );
  const { mode } = useTeamSharing();

  const modeRef = useRef(mode);
  const bridgeInitializedRef = useRef(false);

  // Sync modeRef with current mode
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    // We only want to set up the bridge ONCE
    if (bridgeInitializedRef.current) return;

    const setupBridge = (b: IrSdkBridge) => {
      b.onTelemetry((telemetry) => {
        // Local state for role detection
        const isOnTrackValue = telemetry.IsOnTrack
          ?.value?.[0] as unknown as number;
        setLocalTelemetry({
          isOnTrack: isOnTrackValue,
        });

        if (modeRef.current !== 'guest') {
          setTelemetry(telemetry);

          // P2P BROADCAST LOGIC (Lazy Processing)
          // Just update the manager with the raw reference.
          // It will filter and broadcast at its own pace (5Hz).
          // This is extremely fast (zero object creation/iteration).
          if (teamSharingService.isLocalHost()) {
            teamSharingService.updateTelemetry(telemetry);
          }
        }
      });

      b.onSessionData((session: Session) => {
        // Local state for role detection (Host needs to know their CarIdx)
        setLocalTelemetry({
          sessionId: session.WeekendInfo?.SessionID,
          playerCarIdx: session.DriverInfo?.DriverCarIdx,
          teamId: session.DriverInfo?.Drivers?.find(
            (d) => d.CarIdx === session.DriverInfo?.DriverCarIdx
          )?.TeamID,
          isTeamRacing: !!session.WeekendInfo?.TeamRacing,
        });

        if (modeRef.current !== 'guest') {
          setSession(session);

          if (teamSharingService.isLocalHost()) {
            // Just update reference (Lazy Processing)
            teamSharingService.updateSession(session);
          }
        }
      });

      // Listen for sync requests from guests
      const unsubSync = teamSharingService.onData((msg) => {
        if (msg.type === 'request_sync' && teamSharingService.isLocalHost()) {
          const currentSession = useSessionStore.getState().session;
          if (currentSession) {
            teamSharingService.broadcastManual({
              type: 'session',
              data: currentSession,
            });
          }
          const history = useFuelStore.getState().getLapHistory();
          if (history.length > 0) {
            teamSharingService.broadcastManual({
              type: 'fuel_history',
              data: history,
            });
          }
        }
      });

      bridgeInitializedRef.current = true;
      return () => unsubSync();
    };

    if (bridge instanceof Promise) {
      bridge.then(setupBridge);
    } else {
      setupBridge(bridge);
    }
  }, [bridge, setTelemetry, setSession, setLocalTelemetry]);

  return <></>;
};
