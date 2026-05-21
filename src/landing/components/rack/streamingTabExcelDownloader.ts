import * as XLSX from "xlsx";
import {
  FEC_BER_FAILURE_COLUMNS,
  GPU_COMPUTE_LLDP_FAILURE_COLUMNS,
  GPU_COMPUTE_OPTIC_FAILURE_COLUMNS,
  PATCH_PANEL_COLUMN_SETTINGS,
  RAW_BER_COLUMN_SETTINGS,
  RX_POWER_COLUMN_SETTINGS,
} from "./columns";
import { VALIDATION_COLUMN_ORDER_BY_SECTION } from "./columnOrder";
import { createCsrfHeaders, fetchWithRetry } from "./api";
import { LVV_API } from "./constants";
import { downloadWorkbook, sheetFromRows } from "./excelDownloadUtil";
import {
  asRecord,
  normalizeDeviceStatusesPayload,
  normalizeValidationFailuresPayload,
} from "./validationShared";
import { isGpuComputeDevice } from "./utils";
import {
  DeviceStatus,
  PatchPanelByDevicePort,
  PatchPanelRow,
  RackProps,
  ValidationFailuresByDevice,
  ValidationSection,
  ValidationTableRow,
} from "./types";

type SourceKey = "onDemand" | "streaming";

type SourceBlock = {
  key: SourceKey;
  deviceNames: string[];
  failuresByDevice: ValidationFailuresByDevice;
};

type SheetDefinition = {
  name: string;
  columns: string[];
  sectionTitles: string[];
  includePowerRows?: boolean;
  mapRow: (row: ValidationTableRow, sectionTitle: string) => Record<string, string>;
};

type ColumnDefinition = {
  headerText: string;
  field: string;
  template?: string;
};

type SummaryCountKey =
  | "LLDP Errors"
  | "Optic Errors"
  | "FEC_BER Errors"
  | "Raw BER Errors"
  | "Power Errors"
  | "Interface Errors"
  | "Fan Errors";

const EXPORT_FILENAME_PREFIX = "rack_validation_merged";

const SHEET_DEFINITIONS: SheetDefinition[] = [
  {
    name: "LLDP Mismatch + Link Down",
    columns: [
      "Device A Rack",
      "Device A Name",
      "Device A Port",
      "Expected Device B Rack",
      "Expected Device B Name",
      "Expected Device B Port",
      "Device B Rack",
      "Device B Name",
      "Device B Port",
      "LLDP Status",
      "Patch Panel Matrix",
    ],
    sectionTitles: ["LLDP Errors"],
    mapRow: mapLldpSheetRow,
  },
  {
    name: "Optic Errors",
    columns: [
      "Source Device Name",
      "Source Device Port",
      "Remote Device Name",
      "Remote Device Port",
      "Rx Power",
      "Patch Panel Matrix",
    ],
    sectionTitles: ["Optic Errors"],
    mapRow: mapOpticSheetRow,
  },
  {
    name: "FEC_BER Errors",
    columns: [
      "Device Name",
      "Device Rack",
      "Device Port",
      "Remote Device Name",
      "Remote Device Port",
      "PRE_FEC_BER",
      "Optical RawBer",
      "Lock Status",
      "Issue",
      "Patch Panel Matrix",
    ],
    sectionTitles: ["FEC_BER Errors", "Raw BER Errors"],
    mapRow: mapFecBerSheetRow,
  },
  {
    name: "Power Errors",
    columns: ["Device A Name", "Status"],
    sectionTitles: [],
    includePowerRows: true,
    mapRow: mapPowerSheetRow,
  },
  {
    name: "Interface Down Errors",
    columns: [
      "Source Device Location",
      "Source Device Name",
      "Source Device Port",
      "Remote Device Name",
      "Remote Device Port",
      "Issue",
      "Patch Panel Matrix",
    ],
    sectionTitles: ["Interface Errors"],
    mapRow: mapInterfaceSheetRow,
  },
  {
    name: "Fan Errors",
    columns: ["Device Name", "Fan Name", "Fan Slot", "Status"],
    sectionTitles: ["Fan Errors"],
    mapRow: mapFanSheetRow,
  },
];

const SUMMARY_CATEGORY_ORDER: SummaryCountKey[] = [
  "LLDP Errors",
  "Optic Errors",
  "FEC_BER Errors",
  "Raw BER Errors",
  "Power Errors",
  "Interface Errors",
  "Fan Errors",
];

const DEFAULT_HIDE_UNSUPPORTED = true;

export async function downloadStreamingTabExcel(props: RackProps): Promise<void> {
  const [allDevices, onDemandFailures, patchPanelByDevicePort] = await Promise.all([
    fetchAllDevicesInRack(props),
    fetchOnDemandValidationFailures(props),
    fetchPatchPanelByDevicePort(props),
  ]);

  const onDemandDeviceNames = allDevices
    .filter((device) => isOnDemandMergedEligible(device))
    .map((device) => device.deviceName);

  const streamingDeviceNames = allDevices
    .filter((device) => isStreamingMergedEligible(device))
    .map((device) => device.deviceName);

  const streamingFailures =
    streamingDeviceNames.length > 0
      ? await fetchStreamingValidationFailures(props, streamingDeviceNames)
      : {};

  const sourceBlocks: SourceBlock[] = [
    {
      key: "onDemand",
      deviceNames: onDemandDeviceNames,
      failuresByDevice: filterValidationFailuresByDeviceNames(onDemandFailures, onDemandDeviceNames),
    },
    {
      key: "streaming",
      deviceNames: streamingDeviceNames,
      failuresByDevice: filterValidationFailuresByDeviceNames(streamingFailures, streamingDeviceNames),
    },
  ];

  const workbook = XLSX.utils.book_new();

  const summaryRows = buildSummarySheetRows(sourceBlocks);
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(summaryRows), "Summary");

  SHEET_DEFINITIONS.forEach((sheetDefinition) => {
    const sheetRows = buildDataSheetRows(sheetDefinition, sourceBlocks, patchPanelByDevicePort);
    if (sheetRows.length > 1) {
      XLSX.utils.book_append_sheet(workbook, sheetFromRows(sheetRows), sheetDefinition.name);
    }
  });

  const fileName = `${EXPORT_FILENAME_PREFIX}_${props.rack_serial}.xlsx`;
  downloadWorkbook(workbook, fileName);
}

function buildSummarySheetRows(sourceBlocks: SourceBlock[]): string[][] {
  const rows: string[][] = [
    ["Error Category", "Error Count"],
  ];

  SUMMARY_CATEGORY_ORDER.forEach((category) => {
    const totalCount = sourceBlocks.reduce(
      (total, sourceBlock) => total + countRowsForCategory(sourceBlock, category),
      0
    );
    if (totalCount > 0) {
      rows.push([
        category,
        String(totalCount),
      ]);
    }
  });

  return rows;
}

function countRowsForCategory(sourceBlock: SourceBlock | undefined, category: SummaryCountKey): number {
  if (!sourceBlock) {
    return 0;
  }

  let total = 0;
  sourceBlock.deviceNames.forEach((deviceName) => {
    const deviceFailures = sourceBlock.failuresByDevice[deviceName];
    if (!deviceFailures) {
      return;
    }

    if (category === "Power Errors") {
      total += deviceFailures.powerRows.length;
      return;
    }

    const sectionKey = normalizeSectionTitle(category);
    const section = deviceFailures.sections[sectionKey];
    if (!section) {
      return;
    }

    const filteredRows =
      DEFAULT_HIDE_UNSUPPORTED && isLldpSection(section.title)
        ? section.rows.filter((row) => String(row.linkStatus).toUpperCase() !== "UNSUPPORTED")
        : section.rows;

    total += filteredRows.length;
  });

  return total;
}

function buildDataSheetRows(
  sheetDefinition: SheetDefinition,
  sourceBlocks: SourceBlock[],
  patchPanelByDevicePort: PatchPanelByDevicePort
): string[][] {
  const rows: string[][] = [sheetDefinition.columns];
  const combinedRows = collectCombinedRowsForSheet(
    sheetDefinition,
    sourceBlocks,
    patchPanelByDevicePort
  );

  combinedRows.forEach(({ sectionTitle, row }) => {
    rows.push(buildHardcodedSheetRowValues(sheetDefinition, row, sectionTitle));
  });

  return rows;
}

function collectPowerRows(sourceBlock: SourceBlock): ValidationTableRow[] {
  const rows: ValidationTableRow[] = [];
  sourceBlock.deviceNames.forEach((deviceName) => {
    const deviceFailures = sourceBlock.failuresByDevice[deviceName];
    if (!deviceFailures || deviceFailures.powerRows.length === 0) {
      return;
    }

    rows.push(...deviceFailures.powerRows);
  });
  return rows;
}

function collectCombinedRowsForSheet(
  sheetDefinition: SheetDefinition,
  sourceBlocks: SourceBlock[],
  patchPanelByDevicePort: PatchPanelByDevicePort
): Array<{ sectionTitle: string; row: ValidationTableRow }> {
  const rows: Array<{ sectionTitle: string; row: ValidationTableRow }> = [];

  sourceBlocks.forEach((sourceBlock) => {
    if (sheetDefinition.includePowerRows) {
      collectPowerRows(sourceBlock).forEach((row) => {
        rows.push({ sectionTitle: "Power Errors", row });
      });
    }

    sheetDefinition.sectionTitles.forEach((sectionTitle) => {
      sourceBlock.deviceNames.forEach((deviceName) => {
        const deviceFailures = sourceBlock.failuresByDevice[deviceName];
        if (!deviceFailures) {
          return;
        }

        const section = findSectionByTitle(deviceFailures, sectionTitle);
        if (!section) {
          return;
        }

        const filteredRows =
          DEFAULT_HIDE_UNSUPPORTED && isLldpSection(section.title)
            ? section.rows.filter((row) => String(row.linkStatus).toUpperCase() !== "UNSUPPORTED")
            : section.rows;

        addPatchPanelToSectionRowsForExport(
          section.title,
          filteredRows,
          patchPanelByDevicePort
        ).forEach((row) => {
          rows.push({ sectionTitle: section.title, row });
        });
      });
    });
  });

  return rows;
}

function findSectionByTitle(
  deviceFailures: ValidationFailuresByDevice[string],
  sectionTitle: string
): ValidationSection | null {
  const target = normalizeSectionTitle(sectionTitle);
  for (const sectionKey of deviceFailures.sectionOrder) {
    const section = deviceFailures.sections[sectionKey];
    if (section && normalizeSectionTitle(section.title) === target) {
      return section;
    }
  }
  return null;
}

function buildHardcodedSheetRowValues(
  sheetDefinition: SheetDefinition,
  row: ValidationTableRow,
  sectionTitle: string
): string[] {
  const mappedRow = sheetDefinition.mapRow(row, sectionTitle);
  const values = sheetDefinition.columns.map((column) =>
    normalizeMissingValue(mappedRow[column] ?? "")
  );

  injectRetrievedError(values, row);

  return values.map((value) => normalizeMissingValue(value));
}

function injectRetrievedError(values: string[], row: ValidationTableRow): void {
  const httpStatus = firstTextValue(row["HTTP Status"], row.httpStatus);
  const errorMessage = firstTextValue(row.errorMessage, row["Error Message"]);

  if (!httpStatus && !errorMessage) {
    return;
  }

  const identifier =
    firstTextValue(
      row.deviceAName,
      row["Device A Name"],
      row.deviceName,
      row["Device Name"],
      row.sourceDeviceName,
      row["Source Device Name"],
      row.validationDeviceName
    ) || "error";

  if (values.length > 0 && normalizeMissingValue(values[0]) === "missing") {
    values[0] = identifier;
  }

  let index = 1;
  [httpStatus, errorMessage].forEach((token) => {
    if (!token) {
      return;
    }
    while (index < values.length && normalizeMissingValue(values[index]) !== "missing") {
      index += 1;
    }
    if (index < values.length) {
      values[index] = token;
      index += 1;
    }
  });
}

function mapLldpSheetRow(row: ValidationTableRow): Record<string, string> {
  return {
    "Device A Name": firstTextValue(
      row.deviceAName,
      row["Device A Name"],
      row.sourceDeviceName,
      row["Source Device Name"],
      row.deviceName,
      row["Device Name"],
      row.validationDeviceName
    ),
    "Device B Port": firstTextValue(
      row.currentDeviceBPort,
      row["Current Device B Port"],
      row["Device B Port"],
      row.remoteDevicePort,
      row["Remote Device Port"]
    ),
    "Device B Rack": getLldpLocationCellValue(
      row.currentBLocation,
      row["Current B Location"],
      row["Current Device B Location"],
      row.currentDeviceBRack,
      row["Current Device B Rack"],
      row["Device B Rack"]
    ),
    "Expected Device B Name": firstTextValue(
      row.expectedDeviceBName,
      row["Expected Device B Name"]
    ),
    "Device A Rack": getLldpLocationCellValue(
      row.deviceALocation,
      row["Device A Location"],
      row.deviceARack,
      row["Device A Rack"]
    ),
    "Expected Device B Rack": getLldpLocationCellValue(
      row.expectedBLocation,
      row["Expected B Location"],
      row["Expected Device B Location"],
      row.expectedDeviceBRack,
      row["Expected Device B Rack"]
    ),
    "Device B Name": firstTextValue(
      row.currentDeviceBName,
      row["Current Device B Name"],
      row["Device B Name"],
      row.remoteDeviceName,
      row["Remote Device Name"]
    ),
    "Device A Port": firstTextValue(
      row.deviceAPort,
      row["Device A Port"],
      row.sourceDevicePort,
      row["Source Device Port"],
      row.devicePort,
      row["Device Port"]
    ),
    "LLDP Status": getLldpStatusDisplayValue(row),
    "Expected Device B Port": firstTextValue(
      row.expectedDeviceBPort,
      row["Expected Device B Port"]
    ),
    "Patch Panel Matrix": getPatchPanelMatrixDisplayValue(row.patchPanelMatrix),
  };
}

function mapOpticSheetRow(row: ValidationTableRow): Record<string, string> {
  return {
    "Source Device Name": firstTextValue(
      row.sourceDeviceName,
      row["Source Device Name"],
      row.deviceName,
      row["Device Name"],
      row.validationDeviceName
    ),
    "Source Device Port": firstTextValue(
      row.sourceDevicePort,
      row["Source Device Port"],
      row.devicePort,
      row["Device Port"]
    ),
    "Remote Device Name": firstTextValue(
      row.remoteDeviceName,
      row["Remote Device Name"]
    ),
    "Remote Device Port": firstTextValue(
      row.remoteDevicePort,
      row["Remote Device Port"]
    ),
    "Rx Power": getExportRxPowerValue(row),
    "Patch Panel Matrix": getPatchPanelMatrixDisplayValue(row.patchPanelMatrix),
  };
}

function mapFecBerSheetRow(
  row: ValidationTableRow,
  sectionTitle: string
): Record<string, string> {
  const isRawBer = normalizeSectionTitle(sectionTitle) === "raw ber errors";
  return {
    "Device Name": firstTextValue(
      row.deviceName,
      row["Device Name"],
      row.sourceDeviceName,
      row["Source Device Name"],
      row.validationDeviceName
    ),
    "Device Rack": firstTextValue(row.deviceRack, row["Device Rack"]),
    "Device Port": firstTextValue(
      row.devicePort,
      row["Device Port"],
      row["Interface"],
      row.sourceDevicePort,
      row["Source Device Port"]
    ),
    "Remote Device Name": firstTextValue(
      row.remoteDeviceName,
      row["Remote Device Name"],
      row.remoteDevice,
      row["Remote Device"]
    ),
    "Remote Device Port": firstTextValue(
      row.remoteDevicePort,
      row["Remote Device Port"],
      row.remoteInterface,
      row["Remote Interface"]
    ),
    "PRE_FEC_BER": isRawBer ? "" : firstTextValue(row.preFecBer, row["PRE_FEC_BER"]),
    "Optical RawBer": isRawBer
      ? getExportOpticalRawBerValue(row)
      : firstTextValue(row.opticalRawBer, row["Optical RawBer"], row.laneValues, row["Lane Values"]),
    "Lock Status": isRawBer ? "" : firstTextValue(row.lockStatus, row["Lock Status"]),
    "Issue": firstTextValue(row.issue, row["Issue"]),
    "Patch Panel Matrix": getPatchPanelMatrixDisplayValue(row.patchPanelMatrix),
  };
}

function mapPowerSheetRow(row: ValidationTableRow): Record<string, string> {
  return {
    "Device A Name": firstTextValue(
      row.deviceAName,
      row["Device A Name"],
      row.deviceName,
      row["Device Name"],
      row.validationDeviceName
    ),
    "Status": getExportStatusValue(row.status, row["Status"]),
  };
}

function mapInterfaceSheetRow(row: ValidationTableRow): Record<string, string> {
  return {
    "Source Device Location": formatLocationValueForDisplay(
      row.sourceDeviceLocation ?? row["Source Device Location"]
    ),
    "Source Device Name": firstTextValue(
      row.sourceDeviceName,
      row["Source Device Name"],
      row.deviceName,
      row["Device Name"],
      row.validationDeviceName
    ),
    "Source Device Port": firstTextValue(
      row.sourceDevicePort,
      row["Source Device Port"],
      row.devicePort,
      row["Device Port"]
    ),
    "Remote Device Name": firstTextValue(
      row.remoteDeviceName,
      row["Remote Device Name"]
    ),
    "Remote Device Port": firstTextValue(
      row.remoteDevicePort,
      row["Remote Device Port"]
    ),
    "Issue": firstTextValue(row.issue, row["Issue"]),
    "Patch Panel Matrix": getPatchPanelMatrixDisplayValue(row.patchPanelMatrix),
  };
}

function mapFanSheetRow(row: ValidationTableRow): Record<string, string> {
  return {
    "Device Name": firstTextValue(
      row.deviceName,
      row["Device Name"],
      row.validationDeviceName
    ),
    "Fan Name": firstTextValue(row.fanName, row["Fan Name"]),
    "Fan Slot": firstTextValue(row.fanSlot, row["Fan Slot"]),
    "Status": getExportStatusValue(row.status, row["Status"]),
  };
}

function firstTextValue(...values: unknown[]): string {
  const value = values.find((candidate) => `${candidate ?? ""}`.trim() !== "");
  return value == null ? "" : String(value).trim();
}

function filterValidationFailuresByDeviceNames(
  failuresByDevice: ValidationFailuresByDevice,
  deviceNames: string[]
): ValidationFailuresByDevice {
  const allowed = new Set(deviceNames);
  return Object.entries(failuresByDevice).reduce<ValidationFailuresByDevice>((filtered, [deviceName, deviceFailures]) => {
    if (allowed.has(deviceName)) {
      filtered[deviceName] = deviceFailures;
    }
    return filtered;
  }, {});
}

function isOnDemandMergedEligible(device: DeviceStatus): boolean {
  if (device.validationEligible !== true) {
    return false;
  }

  const validationMode = normalizeValidationMode(device.validationMode);
  if (validationMode) {
    return validationMode === "ON_DEMAND";
  }

  return true;
}

function isStreamingMergedEligible(device: DeviceStatus): boolean {
  if (device.validationEligible !== true) {
    return false;
  }

  const validationMode = normalizeValidationMode(device.validationMode);
  if (validationMode) {
    return validationMode === "STREAMING";
  }

  return false;
}

function normalizeValidationMode(value: string | undefined): "ON_DEMAND" | "STREAMING" | "" {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "ON_DEMAND" || normalized === "STREAMING") {
    return normalized;
  }
  return "";
}

async function fetchAllDevicesInRack(props: RackProps): Promise<DeviceStatus[]> {
  const url = new URL(`${LVV_API}/allDevicesInRack`);
  url.searchParams.set("rackSerialNumber", props.rack_serial);
  url.searchParams.set("regionName", props.region);
  url.searchParams.set("rackNumber", props.rack);
  url.searchParams.set("buildingName", props.building);
  url.searchParams.set("isGPURack", String(Boolean(props.isGpuRack)));
  url.searchParams.set("rackState", String(props.rackState || ""));

  const response = await fetchWithRetry(url.href, { method: "GET" });
  if (!response.ok) {
    throw new Error(`allDevicesInRack query failed (${response.status} ${response.statusText})`);
  }

  const payload: unknown = await response.json();
  return normalizeDeviceStatusesPayload(payload);
}

async function fetchOnDemandValidationFailures(props: RackProps): Promise<ValidationFailuresByDevice> {
  const url = new URL(`${LVV_API}/cablingValidation`);
  url.searchParams.set("regionName", props.region);
  url.searchParams.set("rackSerialNumber", props.rack_serial);

  const response = await fetchWithRetry(url.href, { method: "GET" });
  if (!response.ok) {
    throw new Error(`cablingValidation query failed (${response.status} ${response.statusText})`);
  }

  const payload: unknown = await response.json();
  return normalizeValidationFailuresPayload(payload, props.rack_serial);
}

async function fetchStreamingValidationFailures(
  props: RackProps,
  deviceNames: string[]
): Promise<ValidationFailuresByDevice> {
  const url = new URL(`${LVV_API}/getResultsFromValidationService`);
  const headers = createCsrfHeaders();
  headers.append("Content-Type", "application/json");

  const payload = {
    regionName: props.region,
    buildingName: props.building,
    rackSerialNumber: props.rack_serial,
    rackNumber: props.rack,
    devices: deviceNames.map((deviceName) => ({
      deviceName,
      isGpuDevice: isGpuComputeDevice(deviceName, props.isGpuRack),
    })),
  };

  const response = await fetchWithRetry(url.href, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(
      `getResultsFromValidationService query failed (${response.status} ${response.statusText})`
    );
  }

  const resultPayload: unknown = await response.json();
  return normalizeValidationFailuresPayload(resultPayload, props.rack_serial);
}

async function fetchPatchPanelByDevicePort(props: RackProps): Promise<PatchPanelByDevicePort> {
  const patchPanelRows = await fetchPatchPanelRowsByRack(
    props.building,
    props.rack,
    props.rack_serial,
    props.region
  );

  return indexPatchPanelRowsByDevicePort(patchPanelRows);
}

function normalizeDeviceKey(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeIdeCutsheetRows(payload: unknown): PatchPanelRow[] {
  if (Array.isArray(payload)) {
    return payload.filter((item) => asRecord(item) !== null) as PatchPanelRow[];
  }

  const payloadRecord = asRecord(payload);
  if (!payloadRecord) {
    return [];
  }

  const items = payloadRecord["items"];
  if (Array.isArray(items)) {
    return items.filter((item) => asRecord(item) !== null) as PatchPanelRow[];
  }

  return [];
}

function toRawJsonString(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isLookupPortValue(value: string | null | undefined): boolean {
  const normalized = normalizeDeviceKey(value);
  return (
    normalized !== "" &&
    normalized !== "unknown" &&
    normalized !== "n/a" &&
    normalized !== "na" &&
    normalized !== "-" &&
    normalized !== "null"
  );
}

async function fetchPatchPanelRowsByRack(
  buildingName: string | undefined,
  rackNumber: string | undefined,
  rackSerialNumber: string | undefined,
  regionName: string | undefined
): Promise<PatchPanelRow[]> {
  const patchPanelUrl = new URL(`${LVV_API}/patchPanel`);
  if (buildingName && buildingName.trim() !== "") {
    patchPanelUrl.searchParams.set("buildingName", buildingName);
  }
  if (rackNumber && rackNumber.trim() !== "") {
    patchPanelUrl.searchParams.set("rackNumber", rackNumber);
  }
  if (rackSerialNumber && rackSerialNumber.trim() !== "") {
    patchPanelUrl.searchParams.set("rackSerialNumber", rackSerialNumber);
  }
  if (regionName && regionName.trim() !== "") {
    patchPanelUrl.searchParams.set("regionName", regionName);
  }

  const response = await fetchWithRetry(patchPanelUrl.href, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`patchPanel query failed (${response.status} ${response.statusText})`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = [];
  }

  return normalizeIdeCutsheetRows(payload);
}

function indexPatchPanelRowsByDevicePort(
  rows: PatchPanelRow[],
  allowedLookupKeys?: Set<string>
): PatchPanelByDevicePort {
  const byDevicePort: PatchPanelByDevicePort = {};

  rows.forEach((row) => {
    const deviceKey = normalizeDeviceKey(row.deviceName);
    if (!deviceKey) {
      return;
    }

    const addRowForKey = (key: string) => {
      if (!byDevicePort[key]) {
        byDevicePort[key] = [];
      }
      byDevicePort[key].push({
        ...row,
        rawJson: toRawJsonString(row),
      });
    };

    if (isLookupPortValue(row.devicePort)) {
      const devicePortKeys = buildPatchPanelLookupKeys(String(row.deviceName || ""), String(row.devicePort || ""));
      devicePortKeys.forEach((devicePortKey) => {
        if (allowedLookupKeys && !allowedLookupKeys.has(devicePortKey)) {
          return;
        }
        addRowForKey(devicePortKey);
      });
    }
  });

  return byDevicePort;
}

function areStringArraysEqual(left: string[] | undefined, right: string[] | undefined): boolean {
  const leftValues = left || [];
  const rightValues = right || [];
  if (leftValues.length !== rightValues.length) {
    return false;
  }

  return leftValues.every((value, index) => value === rightValues[index]);
}

function normalizeSectionTitle(value: string | undefined | null): string {
  return String(value || "").trim().toLowerCase();
}

function isUsableLookupValue(value: string | undefined | null): boolean {
  const normalized = normalizeDeviceKey(value);
  return !["", "unknown", "n/a", "na", "-", "null"].includes(normalized);
}

function getLookupValue(primary: unknown, fallback?: unknown): string {
  if (isUsableLookupValue(primary == null ? "" : String(primary))) {
    return String(primary ?? "").trim();
  }

  if (isUsableLookupValue(fallback == null ? "" : String(fallback))) {
    return String(fallback ?? "").trim();
  }

  return "";
}

function toDevicePortKey(deviceName: string | undefined | null, devicePort: string | undefined | null): string {
  return `${normalizeDeviceKey(deviceName)}|${normalizeDeviceKey(devicePort)}`;
}

function normalizePortMembership(
  devicePort: string | undefined | null
): { basePort: string; members: number[] } | null {
  const normalizedPort = String(devicePort || "").trim();
  if (!normalizedPort) return null;

  const groupedPortMatch = normalizedPort.match(/^(.*\[)([^\]]+)(\].*)$/);
  if (groupedPortMatch) {
    const [, prefix, groupedSegment, suffix] = groupedPortMatch;
    const prefixWithoutBracket = prefix.slice(0, -1);
    const suffixWithoutBracket = suffix.startsWith("]") ? suffix.slice(1) : suffix;
    const separatorMatch = prefixWithoutBracket.match(/([\/-])$/);
    const separator = separatorMatch ? separatorMatch[1] : "";
    const basePrefix = separator ? prefixWithoutBracket.slice(0, -1) : prefixWithoutBracket;
    const trailingNumberMatch = basePrefix.match(/^(.*?)(\d+)$/);

    const members = groupedSegment
      .split("+")
      .map((part) => Number(part.trim()))
      .filter((part) => Number.isFinite(part))
      .sort((left, right) => left - right);

    if (members.length === 0) return null;

    const basePort = trailingNumberMatch
      ? `${trailingNumberMatch[1]}${separator}${suffixWithoutBracket}`
      : `${basePrefix}${suffixWithoutBracket}`;

    return {
      basePort: basePort.toLowerCase(),
      members,
    };
  }

  const singlePortMatch = normalizedPort.match(/^(.*?)(\d+)$/);
  if (!singlePortMatch) return null;

  const [, prefix, trailingNumberText] = singlePortMatch;
  const trailingNumber = Number(trailingNumberText);
  if (!Number.isFinite(trailingNumber)) return null;

  return {
    basePort: prefix.toLowerCase(),
    members: [trailingNumber],
  };
}

function expandFamilyPortVariants(devicePort: string | undefined | null): string[] {
  const normalizedPort = String(devicePort || "").trim();
  if (!normalizedPort) return [];

  const membership = normalizePortMembership(normalizedPort);
  if (!membership || membership.members.length === 1) {
    return [normalizedPort];
  }

  const variants = new Set<string>([normalizedPort]);
  membership.members.forEach((member) => {
    variants.add(`${membership.basePort}${member}`);
  });

  return Array.from(variants);
}

function buildPatchPanelLookupKeys(
  deviceName: string | undefined | null,
  devicePort: string | undefined | null
): string[] {
  const normalizedDeviceName = String(deviceName || "").trim();
  if (!normalizedDeviceName) return [];

  const lookupKeys = new Set<string>();
  expandFamilyPortVariants(devicePort).forEach((portVariant) => {
    lookupKeys.add(toDevicePortKey(normalizedDeviceName, portVariant));
  });

  const membership = normalizePortMembership(devicePort);
  if (membership && membership.members.length === 1) {
    const member = membership.members[0];
    const pairStart = member % 2 === 0 ? member - 1 : member;
    if (pairStart > 0) {
      lookupKeys.add(toDevicePortKey(normalizedDeviceName, `${membership.basePort}${pairStart}`));
      lookupKeys.add(toDevicePortKey(normalizedDeviceName, `${membership.basePort}${pairStart + 1}`));
      lookupKeys.add(toDevicePortKey(normalizedDeviceName, `${membership.basePort}[${pairStart}+${pairStart + 1}]`));
    }
  }

  return Array.from(lookupKeys);
}

function buildNonLldpPatchPanelLookupKeys(row: ValidationTableRow): string[] {
  const lookupKeys: string[] = [];
  const seen = new Set<string>();
  const candidates: Array<[string, string]> = [
    [getLookupValue(row.deviceName), getLookupValue(row.devicePort)],
    [getLookupValue(row.sourceDeviceName), getLookupValue(row.sourceDevicePort)],
    [
      getLookupValue(row.remoteDeviceName, row.remoteDevice),
      getLookupValue(row.remoteDevicePort, row.remoteInterface),
    ],
    [getLookupValue(row.validationDeviceName), getLookupValue(row["Port Name"])],
    [getLookupValue(row["Host Name"]), getLookupValue(row["Port Name"])],
  ];

  candidates.forEach(([deviceName, devicePort]) => {
    if (!deviceName || !devicePort) {
      return;
    }

    buildPatchPanelLookupKeys(deviceName, devicePort).forEach((lookupKey) => {
      if (seen.has(lookupKey)) {
        return;
      }
      seen.add(lookupKey);
      lookupKeys.push(lookupKey);
    });
  });

  return lookupKeys;
}

function renderPatchPanelValue(rows: PatchPanelRow[]): string {
  if (!rows.length) return "Not Available";

  return rows
    .map((row, index) => {
      const easyMark = Array.isArray(row.easyMark) ? row.easyMark : [];
      if (easyMark.length > 0) {
        const lines = easyMark.map((value) => `• ${value}`);
        return rows.length > 1
          ? `Entry ${index + 1}\n${lines.join("\n")}`
          : lines.join("\n");
      }
      return JSON.stringify(row, null, 2);
    })
    .join("\n\n");
}

function isLldpSection(sectionTitle: string): boolean {
  return normalizeSectionTitle(sectionTitle) === "lldp errors";
}

function isInterfaceSection(sectionTitle: string): boolean {
  return normalizeSectionTitle(sectionTitle) === "interface errors";
}

function isFanSection(sectionTitle: string): boolean {
  return normalizeSectionTitle(sectionTitle) === "fan errors";
}

function isFecBerSection(sectionTitle: string): boolean {
  return normalizeSectionTitle(sectionTitle) === "fec_ber errors";
}

function isGpuLldpSection(sectionTitle: string, sectionRows: ValidationTableRow[]): boolean {
  if (!isLldpSection(sectionTitle)) {
    return false;
  }

  return sectionRows.some((row) =>
    [
      row.deviceALocation,
      row.currentBLocation,
      row.expectedBLocation,
      row.currentDeviceBName,
      row.currentDeviceBPort,
      row.expectedDeviceBName,
      row.expectedDeviceBPort,
    ].some((value) => typeof value === "string" && value.trim() !== "")
  );
}

function isGpuOpticSection(sectionTitle: string, sectionRows: ValidationTableRow[]): boolean {
  if (normalizeSectionTitle(sectionTitle) !== "optic errors") {
    return false;
  }

  return sectionRows.some((row) =>
    [
      row.sourceDeviceName,
      row.sourceDevicePort,
      row.sourceDeviceLocation,
      row.remoteDeviceName,
      row.remoteDevicePort,
    ].some((value) => typeof value === "string" && value.trim() !== "")
  );
}

function isGpuFecBerSection(sectionTitle: string, sectionRows: ValidationTableRow[]): boolean {
  if (!isFecBerSection(sectionTitle)) {
    return false;
  }

  return sectionRows.some((row) =>
    [row.issue, row.laneValues, row["Lane Values"], row["Interface"]].some(
      (value) => typeof value === "string" && value.trim() !== ""
    )
  );
}

function hasRenderableValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim() !== "";
  }

  return value !== null && value !== undefined;
}

function buildGpuLldpColumns(sectionRows: ValidationTableRow[]): ColumnDefinition[] {
  const shouldShowErrorMessage = sectionRows.some((row) =>
    hasRenderableValue(row.errorMessage ?? row["Error Message"])
  );

  const columns = [...GPU_COMPUTE_LLDP_FAILURE_COLUMNS] as ColumnDefinition[];

  if (!shouldShowErrorMessage) {
    return columns.slice(0, 2);
  }

  return columns;
}

const INTERNAL_RENDER_ALIAS_FIELDS = new Set<string>([
  "deviceARack",
  "deviceAName",
  "deviceAPort",
  "deviceAPortDisplayName",
  "deviceALocation",
  "currentDeviceBRack",
  "currentDeviceBName",
  "currentDeviceBPort",
  "currentDeviceBPortDisplayName",
  "currentBLocation",
  "expectedDeviceBRack",
  "expectedDeviceBName",
  "expectedDeviceBPort",
  "expectedDeviceBPortDisplayName",
  "expectedBLocation",
  "linkStatus",
  "sourceDeviceName",
  "sourceDevicePort",
  "sourceDeviceLocation",
  "remoteDeviceName",
  "remoteDevicePort",
  "deviceName",
  "devicePort",
  "txPower",
  "rxPower",
  "opticalRawBer",
  "preFecBer",
  "lockStatus",
  "remoteDevice",
  "remoteInterface",
  "validationDeviceName",
  "fanName",
  "fanSlot",
  "status",
  "issue",
  "errorMessage",
]);

const EXCLUDED_DYNAMIC_FIELDS = new Set<string>([
  "deviceRack",
  "Device Rack",
  "laneValues",
  "Lane Values",
]);

function getColumnTemplate(sectionTitle: string, field: string): string | undefined {
  const normalizedSectionTitle = normalizeSectionTitle(sectionTitle);

  if (field === "linkStatus" || field === "LLDP Status") return "lldpStatusTemplate";
  if (field === "status" || field === "lockStatus" || field === "Status" || field === "Lock Status") {
    return "booleanStatusTemplate";
  }
  if (field === "patchPanelMatrix") return "patchPanelMatrixTemplate";
  if (field === "txPower" || field === "Tx Power") return "txPowerTemplate";
  if (field === "rxPower" || field === "Rx Power") return "rxPowerTemplate";
  if (field === "opticalRawBer" || field === "Optical RawBer") return "opticalRawBerTemplate";
  if (field === "Lane Values" || field === "laneValues") return "laneValuesTemplate";
  if (field === "sourceDeviceLocation" || field === "Source Device Location") {
    return "sourceDeviceLocationTemplate";
  }

  if (field === "errorMessage" || field === "Error Message") {
    return normalizedSectionTitle === "optic errors"
      ? "gpuMultilineErrorMessageTemplate"
      : "errorMessageClampTemplate";
  }

  return undefined;
}

function buildGpuFecBerColumns(sectionRows: ValidationTableRow[]): ColumnDefinition[] {
  const shouldShowDeviceName = sectionRows.some((row) =>
    hasRenderableValue(row.deviceName ?? row["Device Name"])
  );

  const columns: ColumnDefinition[] = [];

  if (shouldShowDeviceName) {
    columns.push({ headerText: "Device Name", field: "Device Name" });
  }

  columns.push(
    { headerText: "Device Port", field: "Interface" },
    {
      headerText: "Lane Values",
      field: "Lane Values",
      template: "laneValuesTemplate",
    },
    {
      headerText: "Issue",
      field: "Issue",
    }
  );

  const shouldShowErrorMessage = sectionRows.some((row) =>
    hasRenderableValue(row.errorMessage ?? row["Error Message"])
  );
  if (shouldShowErrorMessage) {
    columns.push({
      headerText: "Error Message",
      field: "Error Message",
      template: "errorMessageClampTemplate",
    });
  }

  columns.push({
    headerText: "Patch Panel Matrix",
    field: "patchPanelMatrix",
    template: "patchPanelMatrixTemplate",
  });

  return columns;
}

function getSectionColumnsForExport(
  sectionTitle: string,
  sectionRows: ValidationTableRow[],
  isGpuRack?: boolean
): ColumnDefinition[] {
  if (Boolean(isGpuRack) && isGpuLldpSection(sectionTitle, sectionRows)) {
    return buildGpuLldpColumns(sectionRows);
  }

  if (Boolean(isGpuRack) && isGpuFecBerSection(sectionTitle, sectionRows)) {
    return buildGpuFecBerColumns(sectionRows);
  }

  if (isFecBerSection(sectionTitle) && !isGpuRack) {
    const shouldShowErrorMessage = sectionRows.some((row) => {
      const errorMessage = row?.errorMessage;
      return typeof errorMessage === "string" && errorMessage.trim() !== "";
    });

    return (shouldShowErrorMessage
      ? FEC_BER_FAILURE_COLUMNS
      : FEC_BER_FAILURE_COLUMNS.filter((column) => column.field !== "errorMessage")
    ) as ColumnDefinition[];
  }

  const fieldOrder: string[] = [];
  const seen = new Set<string>();

  sectionRows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (
        key === "_key" ||
        INTERNAL_RENDER_ALIAS_FIELDS.has(key) ||
        EXCLUDED_DYNAMIC_FIELDS.has(key) ||
        seen.has(key)
      ) {
        return;
      }
      seen.add(key);
      fieldOrder.push(key);
    });
  });

  const shouldHideErrorMessage =
    isFecBerSection(sectionTitle) &&
    !sectionRows.some((row) => {
      const errorMessage = row?.errorMessage;
      return typeof errorMessage === "string" && errorMessage.trim() !== "";
    });

  const configuredOrder = VALIDATION_COLUMN_ORDER_BY_SECTION[sectionTitle] || [];
  const orderedFields = [
    ...configuredOrder.filter((field) => fieldOrder.includes(field)),
    ...fieldOrder.filter((field) => !configuredOrder.includes(field)),
  ];

  return orderedFields
    .filter((field) => !(shouldHideErrorMessage && field === "errorMessage"))
    .map((field) => {
      const template = getColumnTemplate(sectionTitle, field);
      return {
        headerText: field,
        field,
        ...(template ? { template } : {}),
      };
    });
}

function addPatchPanelToSectionRowsForExport(
  sectionTitle: string,
  rows: ValidationTableRow[],
  patchPanelByDevicePort: PatchPanelByDevicePort
): ValidationTableRow[] {
  if (isFanSection(sectionTitle)) {
    return rows;
  }

  return rows.map((row) => {
    let patchPanelRows: PatchPanelRow[] = [];
    const lookupKeys = (() => {
      if (isLldpSection(sectionTitle)) {
        const keys: string[] = [];
        const primaryName = getLookupValue(String(row.deviceAName ?? ""));
        const primaryPort = getLookupValue(String(row.deviceAPort ?? ""));

        if (isUsableLookupValue(primaryName) && isUsableLookupValue(primaryPort)) {
          keys.push(...buildPatchPanelLookupKeys(primaryName, primaryPort));
        }

        const expectedName = getLookupValue(String(row.expectedDeviceBName ?? ""));
        const expectedPort = getLookupValue(String(row.expectedDeviceBPort ?? ""));
        if (isUsableLookupValue(expectedName) && isUsableLookupValue(expectedPort)) {
          keys.push(...buildPatchPanelLookupKeys(expectedName, expectedPort));
        }

        return keys;
      }

      return buildNonLldpPatchPanelLookupKeys(row);
    })();

    for (const key of lookupKeys) {
      const matches = patchPanelByDevicePort[key] || [];
      if (matches.length > 0) {
        patchPanelRows = matches;
        break;
      }
    }

    return {
      ...row,
      patchPanelMatrix: renderPatchPanelValue(patchPanelRows),
    };
  });
}

function getColumnDisplayValue(
  sectionTitle: string,
  row: ValidationTableRow,
  column: ColumnDefinition
): string {
  const template = column.template || getColumnTemplate(sectionTitle, column.field);

  if (template === "patchPanelMatrixTemplate") {
    return getPatchPanelMatrixDisplayValue(row.patchPanelMatrix);
  }
  if (template === "lldpStatusTemplate") {
    return getLldpStatusDisplayValue(row);
  }
  if (template === "booleanStatusTemplate") {
    return getBooleanStatusDisplayValue(row, column.field);
  }
  if (template === "txPowerTemplate") {
    return getPowerValueDisplayValue(row, "txPower");
  }
  if (template === "rxPowerTemplate") {
    return getPowerValueDisplayValue(row, "rxPower");
  }
  if (template === "opticalRawBerTemplate") {
    return getOpticalRawBerDisplayValue(row);
  }
  if (template === "laneValuesTemplate") {
    return getLaneValuesDisplayValue(row["Lane Values"] ?? row.laneValues);
  }
  if (template === "sourceDeviceLocationTemplate") {
    return formatLocationValueForDisplay(row.sourceDeviceLocation ?? row["Source Device Location"]);
  }
  if (template === "gpuMultilineErrorMessageTemplate" || template === "errorMessageClampTemplate") {
    return `${row.errorMessage ?? row["Error Message"] ?? ""}`.trim() || "Not Available";
  }

  if (column.field === "Error Details") {
    return getGpuLldpErrorDetailsDisplayValue(row);
  }

  const rawValue = row[column.field];
  if (rawValue === null || rawValue === undefined) {
    return "";
  }
  if (Array.isArray(rawValue)) {
    return rawValue.map((value) => String(value)).join("\n");
  }
  if (typeof rawValue === "object") {
    return JSON.stringify(rawValue, null, 2);
  }
  return String(rawValue);
}

function getLldpStatusDisplayValue(row: ValidationTableRow): string {
  const value = String(row.linkStatus || row["LLDP Status"] || "").trim();
  const normalized = value.toLowerCase();
  return normalized === "interface_down" || normalized === "down" ? "DOWN" : value;
}

function getBooleanStatusDisplayValue(row: ValidationTableRow, field?: string): string {
  const rawValue =
    row[field || ""] ??
    row.status ??
    row.lockStatus ??
    row["Status"] ??
    row["Lock Status"] ??
    "";
  const displayValue = `${rawValue ?? ""}`.trim();
  const normalized = displayValue.toLowerCase();
  if (normalized === "true" || normalized === "up" || normalized === "pass") {
    return "✓";
  }
  if (normalized === "false" || normalized === "down" || normalized === "fail") {
    return "✗";
  }
  return displayValue || "-";
}

function getPatchPanelMatrixDisplayValue(rawValue: unknown): string {
  const normalized = `${rawValue ?? ""}`.trim();
  return normalized
    ? normalized.split("•").map((part) => part.trim()).filter(Boolean).join("\n")
    : "Not Available";
}

type RawBerToken = {
  key: string;
  value: string;
};

function parseRawBerEntry(rawEntry: string): RawBerToken[] {
  const normalized = rawEntry.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const tokens: RawBerToken[] = [];
  const pattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*?)(?=\s+[a-zA-Z_][a-zA-Z0-9_]*\s*:|$)/g;

  for (const match of normalized.matchAll(pattern)) {
    const key = (match[1] || "").trim();
    const value = (match[2] || "").trim();
    if (key) {
      tokens.push({ key, value: value || "Not Available" });
    }
  }

  if (tokens.length > 0) {
    return tokens;
  }

  return [{ key: "value", value: normalized }];
}

function formatRawBerEntries(rawValue: unknown): RawBerToken[][] {
  const normalized = normalizeMetricLineBreaks(rawValue);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n+/)
    .map((entry) => parseRawBerEntry(entry))
    .filter((entry) => entry.length > 0);
}

function firstNonEmptyValue(...values: unknown[]): unknown {
  return values.find((value) => `${value ?? ""}`.trim() !== "");
}

function getOpticalRawBerDisplayValue(row: ValidationTableRow): string {
  const entries = formatRawBerEntries(
    firstNonEmptyValue(row.opticalRawBer, row["Optical RawBer"], row.raw_ber, row.rawBer, row["Raw BER"])
  );
  if (entries.length === 0) {
    return "Not Available";
  }

  return entries
    .map((entry) =>
      entry
        .map((token) =>
          token.key.trim().toLowerCase() === "value" ? token.value : `${token.key}: ${token.value}`
        )
        .join(" ")
    )
    .join("\n");
}

function getExportOpticalRawBerValue(row: ValidationTableRow): string {
  return getOpticalRawBerDisplayValue(row);
}

function formatRxPowerValue(rawValue: unknown): string {
  return normalizeMetricLineBreaks(rawValue);
}

function normalizeMetricLineBreaks(rawValue: unknown): string {
  const value = `${rawValue ?? ""}`.trim().replace(/\\n/g, "\n");
  if (!value) {
    return "";
  }

  return value
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\s*;\s*/g, "\n")
    .replace(/,\s*(?=(?:channel[\w.\-]*|lane[\w.\-]*)\s*:)/gi, "\n")
    .replace(/\s+(?=(?:channel[\w.\-]*|lane[\w.\-]*)\s*:)/gi, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function getPowerValueDisplayValue(row: ValidationTableRow, field: "txPower" | "rxPower"): string {
  const isHostTransceiverRxPower =
    field === "rxPower" && Object.prototype.hasOwnProperty.call(row, "RX Power (dBm)");
  const value = formatRxPowerValue(
    field === "rxPower"
      ? firstNonEmptyValue(row[field], row["RX Power (dBm)"])
      : firstNonEmptyValue(row[field], row["Tx Power"])
  );
  if (!value && isHostTransceiverRxPower) {
    return "Not Available";
  }
  if (!value) {
    return "✓";
  }
  return value;
}

function getExportRxPowerValue(row: ValidationTableRow): string {
  return getPowerValueDisplayValue(row, "rxPower");
}

function getExportStatusValue(...values: unknown[]): string {
  const rawValue = firstTextValue(...values);
  if (!rawValue) {
    return "";
  }

  const normalized = rawValue.toLowerCase();
  if (normalized === "true" || normalized === "up" || normalized === "pass") {
    return "UP";
  }
  if (normalized === "false" || normalized === "down" || normalized === "fail") {
    return "DOWN";
  }
  return rawValue;
}

function formatLaneValues(rawValue: unknown): string {
  const value = `${rawValue ?? ""}`.trim().replace(/\\n/g, "\n");
  if (!value) {
    return "";
  }

  return value
    .split(/\s*,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join("\n");
}

function getLaneValuesDisplayValue(rawValue: unknown): string {
  return formatLaneValues(rawValue) || "Not Available";
}

type RackLocation = {
  building?: unknown;
  number?: unknown;
  elevation?: unknown;
  rackNumber?: unknown;
  rackElevation?: unknown;
};

function normalizeMissingValue(value: unknown): string {
  const normalized = `${value ?? ""}`.trim();
  if (normalized === "") {
    return "missing";
  }

  const lowered = normalized.toLowerCase();
  if (
    lowered === "unknown" ||
    lowered === "no data" ||
    lowered === "missing" ||
    lowered === "n/a" ||
    lowered === "na" ||
    lowered === "not available" ||
    lowered === "-" ||
    lowered === "undefined" ||
    lowered === "null"
  ) {
    return "missing";
  }

  return normalized;
}

function parseDelimitedLocationValue(rawLocation: string): RackLocation | null {
  const pairs = rawLocation
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        return null;
      }

      const key = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      return key === "" ? null : ([key, value] as const);
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry));

  if (pairs.length === 0) {
    return null;
  }

  const parsed: RackLocation = {};
  pairs.forEach(([key, value]) => {
    if (key === "building") parsed.building = value;
    if (key === "racknumber" || key === "number") parsed.rackNumber = value;
    if (key === "rackelevation" || key === "elevation") parsed.rackElevation = value;
  });

  if (
    parsed.building === undefined &&
    parsed.rackNumber === undefined &&
    parsed.rackElevation === undefined
  ) {
    return null;
  }

  return parsed;
}

function formatLocationValueForDisplay(rawLocation: unknown): string {
  const normalized = `${rawLocation ?? ""}`.trim();
  if (normalized === "") {
    return "missing";
  }

  const lowered = normalized.toLowerCase();
  if (lowered === "unknown" || lowered === "no data" || lowered === "missing") {
    return "missing";
  }

  try {
    const parsed = JSON.parse(normalized) as RackLocation;
    return [
      normalizeMissingValue(parsed?.building),
      normalizeMissingValue(parsed?.rackNumber ?? parsed?.number),
      normalizeMissingValue(parsed?.rackElevation ?? parsed?.elevation),
    ].join(":");
  } catch {
    const parsed = parseDelimitedLocationValue(normalized);
    if (!parsed) {
      return normalized;
    }

    return [
      normalizeMissingValue(parsed?.building),
      normalizeMissingValue(parsed?.rackNumber ?? parsed?.number),
      normalizeMissingValue(parsed?.rackElevation ?? parsed?.elevation),
    ].join(":");
  }
}

function getLldpLocationCellValue(...values: unknown[]): string {
  for (const value of values) {
    const formattedValue = formatLocationValueForDisplay(value);
    if (normalizeMissingValue(formattedValue) !== "missing") {
      return formattedValue;
    }
  }

  return "";
}

function mapGpuComputePortToNicLabel(rawPort: string): string | null {
  const match = rawPort.match(/^slot(\d+)\/port(\d+)-(\d+)$/i);
  if (!match) {
    return null;
  }

  const slot = Number(match[1]);
  const portGroup = Number(match[2]);
  const lane = Number(match[3]);
  if (!Number.isFinite(slot) || !Number.isFinite(portGroup) || !Number.isFinite(lane)) {
    return null;
  }

  const mpoSuffixByLane: Record<number, string> = {
    1: "left.1",
    2: "left.2",
    3: "right.1",
    4: "right.2",
  };
  const mpoSuffix = mpoSuffixByLane[lane];
  if (!mpoSuffix) {
    return null;
  }

  const nicNumber = (slot - 1) * 2 + portGroup;
  if (nicNumber < 1) {
    return null;
  }

  return `NIC${nicNumber}.MPO-${mpoSuffix}`;
}

function buildGpuLldpDetailParts(
  location: unknown,
  port: unknown,
  name: unknown,
  portDisplayName?: unknown,
  mapPortLabel: boolean = false
): string[] {
  const portValue = normalizeMissingValue(port);
  const backendDisplayPortValue = normalizeMissingValue(portDisplayName);
  const hasBackendDisplayPort =
    backendDisplayPortValue !== "missing" &&
    backendDisplayPortValue !== portValue;
  const displayPortValue =
    hasBackendDisplayPort
      ? backendDisplayPortValue
      : mapPortLabel
        ? mapGpuComputePortToNicLabel(portValue) || portValue
        : portValue;
  return [
    formatLocationValueForDisplay(location),
    displayPortValue,
    `${normalizeMissingValue(name)}:${portValue}`,
  ];
}

function getGpuLldpErrorDetailsDisplayValue(row: ValidationTableRow): string {
  const interfaceParts = buildGpuLldpDetailParts(
    row.deviceALocation,
    row.deviceAPort,
    row.deviceAName,
    row.deviceAPortDisplayName
  );
  const expectedParts = buildGpuLldpDetailParts(
    row.expectedBLocation,
    row.expectedDeviceBPort,
    row.expectedDeviceBName,
    row.expectedDeviceBPortDisplayName,
    true
  );
  const observedParts = buildGpuLldpDetailParts(
    row.currentBLocation,
    row.currentDeviceBPort,
    row.currentDeviceBName,
    row.currentDeviceBPortDisplayName,
    true
  );

  return [
    `Interface: [${interfaceParts[0]}][${interfaceParts[1]}]${interfaceParts[2]}`,
    `Expected remote: [${expectedParts[0]}][${expectedParts[1]}]${expectedParts[2]}`,
    `Observed remote: [${observedParts[0]}][${observedParts[1]}]${observedParts[2]}`,
  ].join("\n");
}
