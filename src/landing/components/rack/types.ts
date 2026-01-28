export type DeviceStatus = {
  deviceName: string;
  jobStatus: string;
  elevation?: number;
  _key: string;
};

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

export type JobErrorDetails = { code?: number; message?: string } | null;

export type SelectedLinkKey = string;

export type RackProps = {
  onPageChanged: (value: any) => void;
  building: string;
  block: string;
  rack: string;
  ticket: string;
  rack_serial: string;
  region: string;
  resolveEnabled?: boolean;
  resolveDisabledReason?: string;
};
