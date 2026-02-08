import { create, useStore } from 'zustand';

interface LocalTelemetryState {
  isOnTrack: number;
  sessionId: number;
  playerCarIdx: number;
  teamId: number;
  isTeamRacing: boolean;

  setLocalTelemetry: (data: {
    isOnTrack?: number;
    sessionId?: number;
    playerCarIdx?: number;
    teamId?: number;
    isTeamRacing?: boolean;
  }) => void;
}

export const useLocalTelemetryStore = create<LocalTelemetryState>((set) => ({
  isOnTrack: 0,
  sessionId: 0,
  playerCarIdx: -1,
  teamId: 0,
  isTeamRacing: false,

  setLocalTelemetry: (data) => set((state) => ({ ...state, ...data })),
}));

export const useLocalIsOnTrack = () =>
  useStore(useLocalTelemetryStore, (state) => state.isOnTrack);
export const useLocalSessionId = () =>
  useStore(useLocalTelemetryStore, (state) => state.sessionId);
export const useLocalPlayerCarIdx = () =>
  useStore(useLocalTelemetryStore, (state) => state.playerCarIdx);
export const useLocalTeamId = () =>
  useStore(useLocalTelemetryStore, (state) => state.teamId);
export const useLocalIsTeamRacing = () =>
  useStore(useLocalTelemetryStore, (state) => state.isTeamRacing);
