const DEFAULT_COLUMN_SETTINGS = {
  resizable: "enabled",
  sortable: "enabled",
} as const;

const RX_POWER_COLUMN_SETTINGS = {
  ...DEFAULT_COLUMN_SETTINGS,
  headerStyle: "min-width: 286px; width: 286px;",
  style: "min-width: 286px; width: 286px;",
} as const;

const PATCH_PANEL_COLUMN_SETTINGS = {
  ...DEFAULT_COLUMN_SETTINGS,
  headerStyle: "min-width: 300px; width: 300px;",
  style: "min-width: 300px; width: 300px;",
} as const;

export const LLDP_FAILURE_COLUMNS: any[] = [
  { headerText: "Device A Rack", field: "deviceARack", id: "deviceARack", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Device A Name", field: "deviceAName", id: "deviceAName", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Device A Port", field: "deviceAPort", id: "deviceAPort", ...DEFAULT_COLUMN_SETTINGS },
  {
    headerText: "Current Device B Rack",
    field: "currentDeviceBRack",
    id: "currentDeviceBRack",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Current Device B Name",
    field: "currentDeviceBName",
    id: "currentDeviceBName",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Current Device B Port",
    field: "currentDeviceBPort",
    id: "currentDeviceBPort",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Expected Device B Rack",
    field: "expectedDeviceBRack",
    id: "expectedDeviceBRack",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Expected Device B Name",
    field: "expectedDeviceBName",
    id: "expectedDeviceBName",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Expected Device B Port",
    field: "expectedDeviceBPort",
    id: "expectedDeviceBPort",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Link Status",
    field: "linkStatus",
    id: "linkStatus",
    template: "lldpStatusTemplate",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Patch Panel Matrix",
    field: "patchPanelMatrix",
    id: "patchPanelMatrix",
    template: "patchPanelMatrixTemplate",
    ...PATCH_PANEL_COLUMN_SETTINGS,
  },
];

export const GPU_COMPUTE_LLDP_FAILURE_COLUMNS: any[] = [
  {
    headerText: "Error Details",
    field: "errorDetails",
    id: "errorDetails",
    template: "gpuLldpErrorDetailsTemplate",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Patch Panel Matrix",
    field: "patchPanelMatrix",
    id: "patchPanelMatrix",
    template: "patchPanelMatrixTemplate",
    ...PATCH_PANEL_COLUMN_SETTINGS,
  },
  {
    headerText: "Error Message",
    field: "errorMessage",
    id: "errorMessage",
    template: "gpuMultilineErrorMessageTemplate",
    ...DEFAULT_COLUMN_SETTINGS,
  },
];

export const OPTIC_FAILURE_COLUMNS: any[] = [
  { headerText: "Device Name", field: "deviceName", id: "deviceName", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Device Port", field: "devicePort", id: "devicePort", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Tx Power", field: "txPower", id: "txPower", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Rx Power", field: "rxPower", id: "rxPower", ...DEFAULT_COLUMN_SETTINGS },
  {
    headerText: "Patch Panel Matrix",
    field: "patchPanelMatrix",
    id: "patchPanelMatrix",
    template: "patchPanelMatrixTemplate",
    ...PATCH_PANEL_COLUMN_SETTINGS,
  },
];

export const GPU_COMPUTE_OPTIC_FAILURE_COLUMNS: any[] = [
  { headerText: "Source Device Name", field: "sourceDeviceName", id: "sourceDeviceName", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Source Device Port", field: "sourceDevicePort", id: "sourceDevicePort", ...DEFAULT_COLUMN_SETTINGS },
  {
    headerText: "Source Device Location",
    field: "sourceDeviceLocation",
    id: "sourceDeviceLocation",
    template: "sourceDeviceLocationTemplate",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  { headerText: "Remote Device Name", field: "remoteDeviceName", id: "remoteDeviceName", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Remote Device Port", field: "remoteDevicePort", id: "remoteDevicePort", ...DEFAULT_COLUMN_SETTINGS },
  {
   headerText: "Rx Power",
   field: "rxPower",
   id: "rxPower",
   template: "rxPowerTemplate",
   ...RX_POWER_COLUMN_SETTINGS,
  },
  { headerText: "Error Message", field: "errorMessage", id: "errorMessage", template: "gpuMultilineErrorMessageTemplate", ...DEFAULT_COLUMN_SETTINGS },
  {
    headerText: "Patch Panel Matrix",
    field: "patchPanelMatrix",
    id: "patchPanelMatrix",
    template: "patchPanelMatrixTemplate",
    ...PATCH_PANEL_COLUMN_SETTINGS,
  },
];

export const INTERFACE_FAILURE_COLUMNS: any[] = [
  { headerText: "Device Name", field: "deviceName", id: "deviceName", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Device Port", field: "devicePort", id: "devicePort", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Issue", field: "issue", id: "issue", ...DEFAULT_COLUMN_SETTINGS },
  {
    headerText: "Patch Panel Matrix",
    field: "patchPanelMatrix",
    id: "patchPanelMatrix",
    template: "patchPanelMatrixTemplate",
    ...PATCH_PANEL_COLUMN_SETTINGS,
  },
];

export const GPU_COMPUTE_INTERFACE_FAILURE_COLUMNS: any[] = [
  { headerText: "Source Device Name", field: "sourceDeviceName", id: "sourceDeviceName", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Source Device Port", field: "sourceDevicePort", id: "sourceDevicePort", ...DEFAULT_COLUMN_SETTINGS },
  {
    headerText: "Source Device Location",
    field: "sourceDeviceLocation",
    id: "sourceDeviceLocation",
    template: "sourceDeviceLocationTemplate",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  { headerText: "Remote Device Name", field: "remoteDeviceName", id: "remoteDeviceName", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Remote Device Port", field: "remoteDevicePort", id: "remoteDevicePort", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Issue", field: "issue", id: "issue", ...DEFAULT_COLUMN_SETTINGS },
  {
    headerText: "Patch Panel Matrix",
    field: "patchPanelMatrix",
    id: "patchPanelMatrix",
    template: "patchPanelMatrixTemplate",
    ...PATCH_PANEL_COLUMN_SETTINGS,
  },
];

export const FEC_BER_FAILURE_COLUMNS: any[] = [
  { headerText: "Device Rack", field: "deviceRack", id: "deviceRack", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Device Name", field: "deviceName", id: "deviceName", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Device Port", field: "devicePort", id: "devicePort", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "PRE_FEC_BER", field: "preFecBer", id: "preFecBer", ...DEFAULT_COLUMN_SETTINGS },
  {
    headerText: "Lock Status",
    field: "lockStatus",
    id: "lockStatus",
    template: "booleanStatusTemplate",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Remote Device",
    field: "remoteDevice",
    id: "remoteDevice",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Remote Interface",
    field: "remoteInterface",
    id: "remoteInterface",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Error Message",
    field: "errorMessage",
    id: "errorMessage",
    template: "errorMessageClampTemplate",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Patch Panel Matrix",
    field: "patchPanelMatrix",
    id: "patchPanelMatrix",
    template: "patchPanelMatrixTemplate",
    ...PATCH_PANEL_COLUMN_SETTINGS,
  },
];

export const FAN_FAILURE_COLUMNS: any[] = [
  { headerText: "Device Name", field: "deviceName", id: "deviceName", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Fan Name", field: "fanName", id: "fanName", ...DEFAULT_COLUMN_SETTINGS },
  { headerText: "Fan Slot", field: "fanSlot", id: "fanSlot", ...DEFAULT_COLUMN_SETTINGS },
  {
    headerText: "Status",
    field: "status",
    id: "status",
    template: "booleanStatusTemplate",
    ...DEFAULT_COLUMN_SETTINGS,
  },
  {
    headerText: "Error Message",
    field: "errorMessage",
    id: "errorMessage",
    ...DEFAULT_COLUMN_SETTINGS,
  },
];
