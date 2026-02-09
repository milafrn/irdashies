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
      // Store unsubs for cleanup
      const unsubs: (() => void)[] = [];

      const unsubSession = b.onSessionData((session) => {
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
      if (unsubSession) {
        unsubs.push(unsubSession);
      }

      return () => {
        unsubs.forEach((u) => u());
        b.stop();
      };
    };

    if (mode === 'guest') {
      const unsub = teamSharingManager.onData((msg) => {
        if (msg.type === 'session') {
          console.log('📡 SessionProvider: Received P2P Session Data');
          setSession(msg.data as Session);
        }
      });

      // Still connect to bridge for local ID/SessionID if possible, usually not needed for guest
      // But keeping it consistent with HEAD logic which initialized it
      if (bridge instanceof Promise) {
        bridge.then((b) => setupBridge(b));
      } else {
        setupBridge(bridge);
      }

      return () => {
        unsub();
      };
    }

    let cleanupFn: (() => void) | undefined;

    if (bridge instanceof Promise) {
      bridge.then((b) => {
        cleanupFn = setupBridge(b);
      });
    } else {
      cleanupFn = setupBridge(bridge);
    }

    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, [bridge, mode, setSession, setLocalTelemetry]);

  return <></>;
};
