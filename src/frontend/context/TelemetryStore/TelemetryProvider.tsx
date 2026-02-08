import type {
  FuelLapData,
  IrSdkBridge,
  Telemetry,
  Session,
} from '@irdashies/types';
import { useTelemetryStore } from './TelemetryStore';
import { useSessionStore } from '../SessionStore/SessionStore';
import { useLocalTelemetryStore } from './LocalTelemetryStore';
import { useFuelStore } from '../../components/FuelCalculator/FuelStore';
import { useEffect, useRef } from 'react';
const DEBUG_LOGGING = false;
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

  // P2P Data listener
  useEffect(() => {
    // REMOVED mode check - always process P2P data when available
    // if (mode === 'guest') {

    // Initial sync request (just in case)
    const timeoutId = setTimeout(() => {
      teamSharingManager.sendToHost({ type: 'request_sync', data: {} });
    }, 1000);

    // NEW: React to connection established events
    const unsubConnection = teamSharingManager.onPeerConnected(() => {
      if (teamSharingManager.isLocalHost()) {
        // As HOST: Broadcast current state to the new guest
        const currentSession = useSessionStore.getState().session;
        if (currentSession) {
          teamSharingManager.broadcast({
            type: 'session',
            data: currentSession,
          });
        }
        const history = useFuelStore.getState().getLapHistory();
        if (history.length > 0) {
          teamSharingManager.broadcast({ type: 'fuel_history', data: history });
        }
      } else if (teamSharingManager.getMode() === 'guest') {
        // As GUEST: Request sync immediately
        teamSharingManager.sendToHost({ type: 'request_sync', data: {} });
      }
    });

    const unsubP2P = teamSharingManager.onData((msg) => {
      // Helper to wrap P2P data into iRacing SDK format
      const wrapP2PData = (
        data: Record<string, unknown>
      ): Partial<Telemetry> => {
        const wrapped: Record<string, unknown> = {};
        if (!data) return {};

        Object.entries(data).forEach(([key, value]) => {
          if (typeof value === 'number' || typeof value === 'boolean') {
            wrapped[key] = { value: [value] };
          } else if (Array.isArray(value)) {
            wrapped[key] = { value };
          } else if (
            typeof value === 'object' &&
            value !== null &&
            'value' in value
          ) {
            wrapped[key] = value;
          } else {
            // Fallback for strings/other
            // wrapped[key] = { value: [value] };
          }
        });
        return wrapped as Partial<Telemetry>;
      };

      if (msg.type === 'telemetry') {
        const incomingData = msg.data as Record<string, unknown>;

        // NORMALIZE SESSION LAPS (Guest Fix)
        if (incomingData.SessionLaps === undefined) {
          const altTotal =
            incomingData.SessionLapsTotal || incomingData.SessionTotalLaps;
          if (altTotal !== undefined) {
            incomingData.SessionLaps = altTotal;
          }
        }

        // WRAP DATA FOR STORE (Critical Fix)
        const wrappedData = wrapP2PData(incomingData);

        // Apply to ZUSTAND Store (Critical for FuelCalculator)
        useTelemetryStore.getState().updateTelemetry(wrappedData);

        // REMOVED: setTelemetry(wrappedData as Telemetry); // This was overwriting the whole state!

        if (DEBUG_LOGGING) {
          // Use flag for Guest verification
        }
      } else if (msg.type === 'request_sync') {
        if (teamSharingManager.isLocalHost()) {
          const session = useSessionStore.getState().session;
          if (session)
            teamSharingManager.broadcast({ type: 'session', data: session });

          const history = useFuelStore.getState().getLapHistory();
          if (history && history.length > 0) {
            teamSharingManager.broadcast({
              type: 'fuel_history',
              data: history,
            });
          }
        }
      } else if (msg.type === 'session') {
        const session = msg.data as Session;
        setSession(session);

        // CRITICAL: Update local telemetry for guest too!
        // Many hooks use sessionId or playerCarIdx to filter results.
        setLocalTelemetry({
          sessionId: session.WeekendInfo?.SessionID,
          playerCarIdx: session.DriverInfo?.DriverCarIdx,
          teamId: session.DriverInfo?.Drivers?.find(
            (d) => d.CarIdx === session.DriverInfo?.DriverCarIdx
          )?.TeamID,
          isTeamRacing: !!session.WeekendInfo?.TeamRacing,
        });
      } else if (msg.type === 'fuel_history') {
        useFuelStore.getState().setLapHistory(msg.data as FuelLapData[]);
      }
    });

    return () => {
      clearTimeout(timeoutId);
      unsubConnection();
      unsubP2P();
    };
    // }
  }, [mode, setTelemetry, setSession, setLocalTelemetry]);

  return <></>;
};
