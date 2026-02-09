import React, { createContext, useContext, useEffect, useState } from 'react';
import { teamSharingService } from '../services/TeamSharing/TeamSharingService';
import { TeamSharingMode } from '../services/TeamSharing/types';

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
    const unsub = teamSharingService.onStatusChange((newMode, id) => {
      // console.log('[TeamSharingContext] Mode changed to:', newMode, 'ID:', id);
      setMode(newMode);
      setPeerId(id);
    });

    const unsubData = teamSharingService.onData(() => {
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
        startHosting: (id) => teamSharingService.startHosting(id),
        joinSession: (id) => teamSharingService.joinSession(id),
        stop: () => teamSharingService.stop(),
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
