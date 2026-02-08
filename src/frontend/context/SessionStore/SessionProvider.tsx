import type { IrSdkBridge, Session } from '@irdashies/types';
import { useSessionStore } from './SessionStore';
import { useLocalTelemetryStore } from '../TelemetryStore/LocalTelemetryStore';
import { useEffect } from 'react';
import { useTeamSharing } from '../TeamSharingContext';
import { teamSharingManager } from '../../utils/TeamSharingManager';

export interface SessionProviderProps {
  bridge: IrSdkBridge | Promise<IrSdkBridge>;
}

export const SessionProvider = ({ bridge }: SessionProviderProps) => {
  const setSession = useSessionStore((state) => state.setSession);
  const setLocalTelemetry = useLocalTelemetryStore(
    (state) => state.setLocalTelemetry
  );
  const { mode } = useTeamSharing();

  useEffect(() => {
    const setupBridge = (b: IrSdkBridge) => {
      b.onSessionData((session) => {
        // Update local store with critical session info
        const playerCarIdx = session.DriverInfo?.DriverCarIdx;
        const playerDriver = session.DriverInfo?.Drivers?.find(
          (d) => d.CarIdx === playerCarIdx
        );

        setLocalTelemetry({
          sessionId: session.WeekendInfo?.SessionID,
          playerCarIdx: playerCarIdx,
          teamId: playerDriver?.TeamID,
          isTeamRacing: !!session.WeekendInfo?.TeamRacing,
        });

        // Update global store ONLY IF we are not a guest
        if (mode !== 'guest') {
          setSession(session);
          if (teamSharingManager.getMode() === 'host') {
            teamSharingManager.broadcast({ type: 'session', data: session });
          }
        }
      });
    };

    if (mode === 'guest') {
      const unsub = teamSharingManager.onData((msg) => {
        if (msg.type === 'session') {
          console.log('📡 SessionProvider: Received P2P Session Data');
          setSession(msg.data as Session);
        }
      });

      if (bridge instanceof Promise) {
        bridge.then((b) => setupBridge(b));
      } else {
        setupBridge(bridge);
      }

      return () => {
        unsub();
      };
    }

    if (bridge instanceof Promise) {
      bridge.then(setupBridge);
      return () => {
        // No-op: global bridge managed at app level
      };
    }

    setupBridge(bridge);
    return () => {
      // No-op: global bridge managed at app level
    };
  }, [bridge, mode, setSession, setLocalTelemetry]);

  return <></>;
};
