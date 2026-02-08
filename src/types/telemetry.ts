import type { TelemetryVariable, TelemetryVarList } from '../app/irsdk/types';

export type Telemetry = {
  [K in keyof TelemetryVarList]: Pick<TelemetryVarList[K], 'value'>;
} & {
  DriverCarFuelMaxLtr?: { value: number[] };
  DriverCarMaxFuelPct?: { value: number[] };
};
export type TelemetryVar<T extends number[] | boolean[]> = Pick<
  TelemetryVariable<T>,
  'value'
>;
