export type DeviceStatus = {
  deviceName: string;
  jobStatus: string;
  elevation?: number;
  validationEligible?: boolean;
  validationEligibilityReason?: string;
  _key: string;
};

/**
 * Legacy flattened validation row shape kept for backward compatibility.
 * New UI uses per-test tables and maps the backend's per-test result sections.
 */
export interface ValidationFailure {
  rackSerial: string;
  deviceARack: string;
  deviceAName: string;
  deviceAPort: string;
  deviceBRack: string;
  deviceBName: string;
  deviceBPort: string;
  linkStatus: string;
  lldpStatus: string;
  deviceBRackExpected: string;
  deviceBNameExpected: string;
  deviceBPortExpected: string;
  txPower: string;
  rxPower: string;
  psuFailure: string;
  psuId: string;
  _key?: string;
}

export type ValidationTestId =
    | "lldp"
    | "optics"
    | "interfaces"
    | "fecBer"
    | "fans"
    | "power";

export interface LldpFailureRow {
  _key: string;
  deviceARack: string;
  deviceAName: string;
  deviceAPort: string;
  currentDeviceBRack: string;
  currentDeviceBName: string;
  currentDeviceBPort: string;
  expectedDeviceBRack: string;
  expectedDeviceBName: string;
  expectedDeviceBPort: string;
  linkStatus: string;
  patchPanelMatrix?: string;
  errorMessage?: string;
}

export interface OpticFailureRow {
  _key: string;
  deviceName: string;
  devicePort: string;
  txPower: string;
  rxPower: string;
  errorMessage?: string;
  patchPanelMatrix?: string;
  sourceDeviceName?: string;
  sourceDevicePort?: string;
  remoteDeviceName?: string;
  remoteDevicePort?: string;
}

export interface InterfaceFailureRow {
  _key: string;
  deviceName: string;
  devicePort: string;
  issue: string;
  patchPanelMatrix?: string;
  sourceDeviceName?: string;
  sourceDevicePort?: string;
  remoteDeviceName?: string;
  remoteDevicePort?: string;
}

export interface FecBerFailureRow {
  _key: string;
  deviceRack: string;
  deviceName: string;
  devicePort: string;
  preFecBer: string;
  lockStatus: string;
  remoteDevice: string;
  remoteInterface: string;
  errorMessage: string;
  patchPanelMatrix?: string;
}

export interface FanFailureRow {
  _key: string;
  deviceName: string;
  fanName: string;
  fanSlot: string;
  status: string;
  errorMessage: string;
}

export interface PowerFailureRow {
  _key: string;
  deviceName: string;
}

export interface DeviceValidationFailures {
  deviceName: string;
  lastValidated?: string | null;
  tests: {
    lldp: LldpFailureRow[];
    optics: OpticFailureRow[];
    interfaces: InterfaceFailureRow[];
    fecBer: FecBerFailureRow[];
    fans: FanFailureRow[];
    power: PowerFailureRow[];
  };
  counts: {
    lldp: number;
    optics: number;
    interfaces: number;
    fecBer: number;
    fans: number;
    power: number;
    nonPowerTotal: number;
    overallTotal: number;
  };
  hasPsuFailure: boolean;
}

export type ValidationFailuresByDevice = Record<string, DeviceValidationFailures>;

export type PatchPanelRow = {
  deviceName?: string;
  devicePort?: string;
  buildingName?: string;
  rackNumber?: string;
  easyMark?: string[];
  [key: string]: unknown;
};

export type PatchPanelByDevicePort = Record<string, PatchPanelRow[]>;

export type JobErrorDetails = { code?: number; message?: string } | null;

export type SelectedLinkKey = string;

export type RackProps = {
  onPageChanged: (value: any) => void;
  building: string;
  block: string;
  rack: string;
  rackState?: string;
  project?: string;
  ticket: string;
  rack_serial: string;
  isGpuRack?: boolean;
  region: string;
  resolveEnabled?: boolean;
  resolveDisabledReason?: string;
};