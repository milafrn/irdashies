import type { IrSdkBridge, Telemetry, Session } from '@irdashies/types';
import { useTelemetryStore } from './TelemetryStore';
import { useSessionStore } from '../SessionStore/SessionStore';
import { useLocalTelemetryStore } from './LocalTelemetryStore';
import { useFuelStore } from '../../components/FuelCalculator/FuelStore';
import { useEffect, useRef } from 'react';
import { useTeamSharing } from '../TeamSharingContext';
import { teamSharingManager } from '../../utils/TeamSharingManager';

const TELEMETRY_WHITELIST = [
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

  const lastBroadcastRef = useRef<number>(0);
  const lastSessionBroadcastRef = useRef<number>(0);
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
        // DEBUG: Log raw SDK data periodically
        // Local state for role detection
        const isOnTrackValue = telemetry.IsOnTrack
          ?.value?.[0] as unknown as number;
        setLocalTelemetry({
          isOnTrack: isOnTrackValue,
        });

        if (modeRef.current !== 'guest') {
          setTelemetry(telemetry);

          if (teamSharingManager.isLocalHost()) {
            const now = Date.now();
            if (now - lastBroadcastRef.current >= 100) {
              const filteredTelemetry: Partial<Telemetry> = {};
              TELEMETRY_WHITELIST.forEach((key) => {
                const rawValue = telemetry[key as keyof Telemetry];
                if (rawValue !== undefined) {
                  // AGGRESSIVE UNWRAPPER (New)
                  const unwrap = (val: unknown, depth = 0): unknown => {
                    if (depth > 5) return val;
                    if (val === undefined || val === null) return undefined;

                    // 0. If it's a primitive (including string), return it
                    if (typeof val !== 'object') return val;

                    // 1. .value wrapper (e.g. { value: [...] })
                    if ('value' in (val as Record<string, unknown>)) {
                      return unwrap(
                        (val as { value: unknown }).value,
                        depth + 1
                      );
                    }

                    // 2. Array-like (Array, TypedArray, but NOT Node.js Buffer?)
                    // Check length and index 0
                    if (Array.isArray(val) && val.length > 0) {
                      return unwrap(val[0], depth + 1);
                    }

                    return val;
                  };

                  const value = unwrap(rawValue);

                  (filteredTelemetry as Record<string, unknown>)[key] = value;
                }
              });

              // NORMALIZE SESSION LAPS (Critical for P2P Calculators)
              // If SessionLaps (standard) is missing, try to fill it with alternates
              if (
                (filteredTelemetry as Record<string, unknown>).SessionLaps ===
                undefined
              ) {
                const t = telemetry as Record<string, unknown>;
                const altTotal = t.SessionLapsTotal || t.SessionTotalLaps;
                if (altTotal !== undefined) {
                  (filteredTelemetry as Record<string, unknown>).SessionLaps =
                    altTotal;
                }
              }

              teamSharingManager.broadcast({
                type: 'telemetry',
                data: filteredTelemetry as Telemetry,
              });
              lastBroadcastRef.current = now;
            }
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
          if (teamSharingManager.isLocalHost()) {
            const now = Date.now();
            // Throttle Session Updates (Huge Payload) to once every 2 seconds
            if (now - lastSessionBroadcastRef.current >= 2000) {
              // Filter session data to avoid huge payloads (only send what guest needs)
              const filteredSession: Partial<Session> = {
                WeekendInfo: session.WeekendInfo,
                DriverInfo: session.DriverInfo
                  ? {
                      ...session.DriverInfo,
                      // Only send essential driver info if many drivers
                      Drivers: session.DriverInfo?.Drivers?.slice(0, 100),
                    }
                  : undefined,
                SessionInfo: session.SessionInfo,
              };
              teamSharingManager.broadcast({
                type: 'session',
                data: filteredSession,
              });
              lastSessionBroadcastRef.current = now;
            }
          }
        }
      });

      // Listen for sync requests from guests
      const unsubSync = teamSharingManager.onData((msg) => {
        if (msg.type === 'request_sync' && teamSharingManager.isLocalHost()) {
          const currentSession = useSessionStore.getState().session;
          if (currentSession) {
            teamSharingManager.broadcast({
              type: 'session',
              data: currentSession,
            });
          }
          const history = useFuelStore.getState().getLapHistory();
          if (history.length > 0) {
            teamSharingManager.broadcast({
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
