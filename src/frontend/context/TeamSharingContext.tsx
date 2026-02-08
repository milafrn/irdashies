import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  teamSharingManager,
  TeamSharingMode,
} from '../utils/TeamSharingManager';

interface TeamSharingContextType {
  mode: TeamSharingMode;
  peerId?: string;
  startHosting: (forcedId?: string) => void;
  joinSession: (hostId: string) => void;
  stop: () => void;
  lastDataReceived?: number;
}

const TeamSharingContext = createContext<TeamSharingContextType | undefined>(
  undefined
);

export const TeamSharingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [mode, setMode] = useState<TeamSharingMode>('idle');
  const [peerId, setPeerId] = useState<string | undefined>(undefined);
  const [lastDataReceived, setLastDataReceived] = useState<number | undefined>(
    undefined
  );

  const lastUpdateRef = React.useRef<number>(0);

  useEffect(() => {
    const unsub = teamSharingManager.onStatusChange((newMode, id) => {
      // console.log('[TeamSharingContext] Mode changed to:', newMode, 'ID:', id);
      setMode(newMode);
      setPeerId(id);
    });

    const unsubData = teamSharingManager.onData(() => {
      const now = Date.now();
      // Throttle UI updates for 'last data' timer to 1Hz
      if (now - lastUpdateRef.current >= 1000) {
        setLastDataReceived(now);
        lastUpdateRef.current = now;
      }
    });

    return () => {
      unsub();
      unsubData();
    };
  }, []);

  return (
    <TeamSharingContext.Provider
      value={{
        mode,
        peerId,
        lastDataReceived,
        startHosting: (id) => teamSharingManager.startHosting(id),
        joinSession: (id) => teamSharingManager.joinSession(id),
        stop: () => teamSharingManager.stop(),
      }}
    >
      {children}
    </TeamSharingContext.Provider>
  );
};

export const useTeamSharing = () => {
  const context = useContext(TeamSharingContext);
  if (!context)
    throw new Error('useTeamSharing must be used within TeamSharingProvider');
  return context;
};
