import React from 'react';
import { useAutoTeamSync } from '../../hooks/useAutoTeamSync';

export const TeamSharingAutoSync: React.FC = () => {
  useAutoTeamSync();
  return null;
};
