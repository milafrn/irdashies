import type {
  DashboardBridge,
  IrSdkBridge,
  PitLaneBridge,
  FuelCalculatorBridge,
  TeamSharingBridge,
} from '@irdashies/types';

declare global {
  interface Window {
    irsdkBridge: IrSdkBridge;
    dashboardBridge: DashboardBridge;
    pitLaneBridge: PitLaneBridge;
    fuelCalculatorBridge: FuelCalculatorBridge;
    teamSharingBridge: TeamSharingBridge;
  }
}
