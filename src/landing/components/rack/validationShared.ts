import {
  DeviceStatus,
  ValidationMode,
  DeviceValidationFailures,
  ValidationFailure,
  ValidationFailuresByDevice,
  ValidationTableRow,
} from "./types";
import { isGpuComputeDevice } from "./utils";
import {
  isPeriodicValidationRefreshEnabledForAllDevices,
  isPeriodicValidationRefreshEnabledForDeviceType,
} from "../../config/configUtils";
import { shouldDisplayHostTransceiverMetrics } from "./readinessDisplayConfig";

export type RowRecord = Record<string, unknown>;

export type RackValidationSummary = {
  isValidated: boolean;
  cableFailures: number;
  opticsFailures: number;
  lldpFailures: number;
  interfaceFailures: number;
  opticModuleFailures: number;
  fecBerFailures: number;
  rawBerFailures: number;
  hostOpticsFailures: number;
  hostOptFailures: number;
  hostFecBerFailures: number;
  deviceFailures: number;
};

export const NOT_VALIDATED_SUMMARY: RackValidationSummary = {
  isValidated: false,
  cableFailures: 0,
  opticsFailures: 0,
  lldpFailures: 0,
  interfaceFailures: 0,
  opticModuleFailures: 0,
  fecBerFailures: 0,
  rawBerFailures: 0,
  hostOpticsFailures: 0,
  hostOptFailures: 0,
  hostFecBerFailures: 0,
  deviceFailures: 0,
};

export const VALIDATION_SERVICE_DEVICE_BATCH_SIZE = 2;

const LAST_VALIDATED_SECTION_TITLE = "Last Validated";
const POWER_SECTION_TITLE = "Power Errors";
const DEVICE_REACHABILITY_SECTION_TITLE = "Device Reachability";

export function asRecord(value: unknown): RowRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as RowRecord;
  }
  return null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    return [items];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export function normalizeSectionKey(title: string): string {
  return String(title || "").trim().toLowerCase();
}

export function normalizeDeviceName(deviceName: string | null | undefined): string {
  return String(deviceName || "").trim().toLowerCase();
}

export function pick(
  record: RowRecord,
  keys: string[],
  fallback: string = "Unknown"
): string {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const value = record[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
  }
  return fallback;
}

export function finalizeCounts(
  device: DeviceValidationFailures
): DeviceValidationFailures {
  const bySection: Record<string, number> = {};
  let nonPowerTotal = 0;

  device.sectionOrder.forEach((sectionKey) => {
    const count = device.sections[sectionKey]?.rows.length || 0;
    bySection[sectionKey] = count;
    nonPowerTotal += count;
  });

  const power = device.powerRows.length;
  return {
    ...device,
    counts: {
      bySection,
      power,
      nonPowerTotal,
      overallTotal: nonPowerTotal + power,
    },
    hasPsuFailure: power > 0,
  };
}

export function normalizeDeviceStatusesPayload(payload: unknown): DeviceStatus[] {
  const rows = asArray(payload);
  const devicesByName = new Map<string, DeviceStatus>();

  rows.forEach((item) => {
    const record = asRecord(item);
    if (!record) return;

    const deviceName = pick(record, ["deviceName", "name", "device_name"], "");
    if (!deviceName) return;

    const prior = devicesByName.get(deviceName);
    const statusValue = pick(record, ["jobStatus", "status", "validationStatus"], "NOT_TRIGGERED");
    const elevation = toInteger(record["elevation"] ?? record["slot"]);
    const eligibility = inferValidationEligibility(record);
    const validationMode = inferValidationMode(record) ?? prior?.validationMode;

    devicesByName.set(deviceName, {
      deviceName,
      jobStatus: statusValue || prior?.jobStatus || "NOT_TRIGGERED",
      elevation:
        typeof elevation === "number"
          ? elevation
          : typeof prior?.elevation === "number"
            ? prior.elevation
            : undefined,
      validationEligible:
        typeof eligibility.eligible === "boolean"
          ? eligibility.eligible
          : prior?.validationEligible,
      validationMode:
        validationMode || prior?.validationMode,
      validationEligibilityReason:
        eligibility.reason || prior?.validationEligibilityReason,
      _key: deviceName,
    });
  });

  return Array.from(devicesByName.values());
}

export function getPeriodicRefreshDeviceNames(
  deviceStatuses: DeviceStatus[],
  options: {
    periodicValidationRefreshEnabled: boolean;
    isGpuRack?: boolean;
  }
): string[] {
  if (!options.periodicValidationRefreshEnabled) {
    return [];
  }

  return deviceStatuses
    .filter((device) => {
      if (device.validationMode === "STREAMING") {
        return device.validationEligible !== false;
      }
      if (device.validationMode === "ON_DEMAND") {
        return false;
      }

      if (isPeriodicValidationRefreshEnabledForAllDevices()) {
        return true;
      }

      if (isGpuComputeDevice(device.deviceName, options.isGpuRack)) {
        return isPeriodicValidationRefreshEnabledForDeviceType("gpuHost");
      }

      return isPeriodicValidationRefreshEnabledForDeviceType("nonGpuDevice");
    })
    .map((device) => device.deviceName);
}

export function normalizeValidationFailuresPayload(
  payload: unknown,
  rackSerial: string
): ValidationFailuresByDevice {
  if (Array.isArray(payload)) {
    return normalizeLegacyValidationRows(payload as ValidationFailure[]);
  }

  const payloadRecord = asRecord(payload);
  if (!payloadRecord) return {};

  let rackNode: unknown = payloadRecord[rackSerial];
  if (!rackNode) {
    const keys = Object.keys(payloadRecord);
    if (keys.length === 1) {
      rackNode = payloadRecord[keys[0]];
    }
  }

  const rackRecord = asRecord(rackNode);
  if (!rackRecord) return {};

  const byDevice: ValidationFailuresByDevice = {};

  Object.entries(rackRecord).forEach(([deviceName, deviceResults]) => {
    const resultsRecord = asRecord(deviceResults);
    if (!resultsRecord) {
      return;
    }

    const current = buildEmptyDeviceValidationFailures(deviceName);
    const lastValidatedValue = resultsRecord[LAST_VALIDATED_SECTION_TITLE];
    current.lastValidated =
      lastValidatedValue === null || lastValidatedValue === undefined
        ? null
        : String(lastValidatedValue).trim() || null;

    Object.entries(resultsRecord).forEach(([sectionTitle, rawRows]) => {
      if (sectionTitle === LAST_VALIDATED_SECTION_TITLE) {
        return;
      }

      if (sectionTitle === DEVICE_REACHABILITY_SECTION_TITLE) {
        current.reachability = extractDeviceReachability(rawRows, deviceName);
        return;
      }

      const sectionKey = normalizeSectionKey(sectionTitle);
      const rows = asArray(rawRows).map((row, idx) =>
        mapDynamicValidationRow(row, deviceName, sectionTitle, idx)
      );
      current.presentSectionKeys?.push(sectionKey);

      if (sectionKey === normalizeSectionKey(POWER_SECTION_TITLE)) {
        current.powerRows = rows;
        return;
      }

      setValidationSectionRows(current, sectionTitle, rows);
    });

    byDevice[deviceName] = finalizeCounts(current);
  });

  return byDevice;
}

export function summarizeValidationFailuresByDevice(
  failuresByDevice: ValidationFailuresByDevice,
  options: {
    includeDeviceNames?: Iterable<string>;
    excludeDeviceNames?: Iterable<string>;
    hostTransceiverDisplayDeviceNames?: Iterable<string>;
  } = {}
): RackValidationSummary {
  const includeNames = toNormalizedNameSet(options.includeDeviceNames);
  const excludeNames = toNormalizedNameSet(options.excludeDeviceNames);
  const hostTransceiverDisplayNames = toNormalizedNameSet(options.hostTransceiverDisplayDeviceNames);

  let includedDeviceCount = 0;
  let cableFailures = 0;
  let opticsFailures = 0;
  let lldpFailures = 0;
  let interfaceFailures = 0;
  let opticModuleFailures = 0;
  let fecBerFailures = 0;
  let rawBerFailures = 0;
  let hostOpticsFailures = 0;
  let hostOptFailures = 0;
  let hostFecBerFailures = 0;
  let deviceFailures = 0;

  Object.entries(failuresByDevice).forEach(([deviceName, failures]) => {
    const normalizedName = normalizeDeviceName(deviceName);
    const isIncludedByMode = !includeNames || includeNames.has(normalizedName);
    const shouldCountBaseFailures = isIncludedByMode && !excludeNames?.has(normalizedName);
    const shouldCountHostTransceiverFailures = shouldCountBaseFailures &&
      (hostTransceiverDisplayNames ? hostTransceiverDisplayNames.has(normalizedName) : true);

    if (!shouldCountBaseFailures && !shouldCountHostTransceiverFailures) {
      return;
    }

    includedDeviceCount += 1;

    if (shouldCountHostTransceiverFailures) {
      const hostTransceiverCounts = getHostTransceiverActionableCounts(failures);
      hostOpticsFailures += hostTransceiverCounts.total;
      hostOptFailures += hostTransceiverCounts.optics;
      hostFecBerFailures += hostTransceiverCounts.fecBer;
    }

    if (!shouldCountBaseFailures) {
      return;
    }

    const lldpCount = getSectionCount(failures, "LLDP Errors");
    const interfaceCount = getSectionCount(failures, "Interface Errors");
    const opticCount = getSectionCount(failures, "Optic Errors");
    const fecBerCount = getSectionCount(failures, "FEC_BER Errors");
    const rawBerCount = getSectionCount(failures, "Raw BER Errors");

    lldpFailures += lldpCount;
    interfaceFailures += interfaceCount;
    opticModuleFailures += opticCount;
    fecBerFailures += fecBerCount;
    rawBerFailures += rawBerCount;
    cableFailures += lldpCount + interfaceCount;
    opticsFailures += opticCount + fecBerCount;
    deviceFailures += failures.counts.power;
    deviceFailures += getSectionCount(failures, "Fan Errors");
  });

  if (includedDeviceCount === 0) {
    return NOT_VALIDATED_SUMMARY;
  }

  return {
    isValidated: true,
    cableFailures,
    opticsFailures,
    lldpFailures,
    interfaceFailures,
    opticModuleFailures,
    fecBerFailures,
    rawBerFailures,
    hostOpticsFailures,
    hostOptFailures,
    hostFecBerFailures,
    deviceFailures,
  };
}

export function mergeRackValidationSummaries(
  ...summaries: RackValidationSummary[]
): RackValidationSummary {
  const merged = summaries.reduce(
    (acc, summary) => ({
      isValidated: acc.isValidated || summary.isValidated,
      cableFailures: acc.cableFailures + summary.cableFailures,
      opticsFailures: acc.opticsFailures + summary.opticsFailures,
      lldpFailures: acc.lldpFailures + summary.lldpFailures,
      interfaceFailures: acc.interfaceFailures + summary.interfaceFailures,
      opticModuleFailures: acc.opticModuleFailures + summary.opticModuleFailures,
      fecBerFailures: acc.fecBerFailures + summary.fecBerFailures,
      rawBerFailures: acc.rawBerFailures + summary.rawBerFailures,
      hostOpticsFailures: acc.hostOpticsFailures + summary.hostOpticsFailures,
      hostOptFailures: acc.hostOptFailures + summary.hostOptFailures,
      hostFecBerFailures: acc.hostFecBerFailures + summary.hostFecBerFailures,
      deviceFailures: acc.deviceFailures + summary.deviceFailures,
    }),
    { ...NOT_VALIDATED_SUMMARY }
  );

  return merged.isValidated ? merged : NOT_VALIDATED_SUMMARY;
}

function inferValidationEligibility(
  record: RowRecord
): { eligible: boolean; reason?: string } {
  const explicitReason = firstString([
    record["validationEligibilityReason"],
    record["eligibilityReason"],
    record["reason"],
  ]);
  const explicitEligibility = firstBoolean([
    record["validationEligible"],
    record["isValidationEligible"],
    record["canValidate"],
    record["canRunValidation"],
    record["validatable"],
    record["isValidatable"],
    record["eligibleForValidation"],
    record["validationSupported"],
  ]);
  if (explicitEligibility !== null) {
    return explicitEligibility
      ? { eligible: true }
      : {
          eligible: false,
          reason: explicitReason || "Device is not in monitored and deployed state.",
        };
  }

  const monitored = inferMonitored(record);
  const deployed = inferDeployed(record);

  if (monitored !== null && deployed !== null) {
    return monitored && deployed
      ? { eligible: true }
      : {
          eligible: false,
          reason: "Device is not in monitored and deployed state.",
        };
  }
  if (monitored !== null) {
    return monitored
      ? { eligible: true }
      : {
          eligible: false,
          reason: "Device is not in monitored and deployed state.",
        };
  }
  if (deployed !== null) {
    return deployed
      ? { eligible: true }
      : {
          eligible: false,
          reason: "Device is not in monitored and deployed state.",
        };
  }

  return { eligible: true };
}

function inferValidationMode(record: RowRecord): ValidationMode | undefined {
  const explicitMode = firstString([
    record["validationMode"],
    record["validation_mode"],
  ]);

  if (!explicitMode) {
    return undefined;
  }

  const normalizedMode = explicitMode.trim().toUpperCase();
  if (normalizedMode === "ON_DEMAND" || normalizedMode === "STREAMING") {
    return normalizedMode as ValidationMode;
  }

  return undefined;
}

function inferMonitored(record: RowRecord): boolean | null {
  const explicit = firstBoolean([
    record["isMonitored"],
    record["monitored"],
    record["monitoringEnabled"],
    record["isMonitoringEnabled"],
  ]);
  if (explicit !== null) return explicit;

  const configAttributes = asRecord(record["configAttributes"]);
  if (configAttributes) {
    if (Object.prototype.hasOwnProperty.call(configAttributes, "monitoring.interfaces")) {
      return toPresenceFlag(configAttributes["monitoring.interfaces"]) ?? false;
    }
  }

  const monitoringInterfaces = readRecordPath(record, ["monitoring", "interfaces"]);
  const monitoringInterfacesDirect = record["monitoringInterfaces"];
  const monitorByPresence = toPresenceFlag(monitoringInterfaces);
  if (monitorByPresence !== null) return monitorByPresence;
  const monitorByPresenceDirect = toPresenceFlag(monitoringInterfacesDirect);
  if (monitorByPresenceDirect !== null) return monitorByPresenceDirect;

  return null;
}

function inferDeployed(record: RowRecord): boolean | null {
  const explicit = firstBoolean([record["isDeployed"], record["deployed"]]);
  if (explicit !== null) return explicit;

  const stateCandidates = [
    record["deviceState"],
    record["state"],
    record["deploymentState"],
    record["lifecycleState"],
    readRecordPath(record, ["state", "conf", "device.state"]),
    readRecordPath(record, ["state", "device.state"]),
    readRecordPath(record, ["conf", "device.state"]),
  ];

  const normalizedState = firstString(stateCandidates);
  if (!normalizedState) return null;

  return normalizedState.toLowerCase() === "deployed";
}

function readRecordPath(record: RowRecord, path: string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    const currentRecord = asRecord(current);
    if (!currentRecord || !Object.prototype.hasOwnProperty.call(currentRecord, key)) {
      return undefined;
    }
    current = currentRecord[key];
  }
  return current;
}

function firstBoolean(values: unknown[]): boolean | null {
  for (const value of values) {
    const parsed = toBoolean(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1", "enabled"].includes(normalized)) return true;
    if (["false", "no", "n", "0", "disabled"].includes(normalized)) return false;
  }
  return null;
}

function toPresenceFlag(value: unknown): boolean | null {
  const parsedBoolean = toBoolean(value);
  if (parsedBoolean !== null) return parsedBoolean;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return true;
  if (typeof value === "string") return value.trim() !== "";
  if (value === null || value === undefined) return null;
  return null;
}

function toInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function text(value: unknown, fallback: string = "Unknown"): string {
  if (value === null || value === undefined) return fallback;
  const rendered = String(value).trim();
  return rendered === "" ? fallback : rendered;
}

function textOrEmpty(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function buildEmptyDeviceValidationFailures(
  deviceName: string
): DeviceValidationFailures {
  return {
    deviceName,
    lastValidated: null,
    reachability: null,
    sections: {},
    sectionOrder: [],
    presentSectionKeys: [],
    periodicSectionKeys: [],
    powerRows: [],
    counts: {
      bySection: {},
      power: 0,
      nonPowerTotal: 0,
      overallTotal: 0,
    },
    hasPsuFailure: false,
  };
}

function extractDeviceReachability(
  rawRows: unknown,
  deviceName: string
): boolean | null {
  const rows = asArray(rawRows);
  const normalizedDeviceName = deviceName.trim().toLowerCase();

  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;

    const rowDeviceName = pick(record, ["Device Name", "deviceName", "device_name"], "")
      .trim()
      .toLowerCase();
    if (rowDeviceName && rowDeviceName !== normalizedDeviceName) {
      continue;
    }

    const parsedReachability = firstBoolean([
      record["Reachability"],
      record["reachability"],
      record["reachable"],
      record["isReachable"],
    ]);
    if (parsedReachability !== null) {
      return parsedReachability;
    }
  }

  return null;
}

function buildValidationRowKey(
  deviceName: string,
  sectionTitle: string,
  idx: number,
  row: RowRecord | null
): string {
  const primaryIdentifier = row
    ? pick(
        row,
        [
          "devicePort",
          "Device Port",
          "Interface",
          "deviceAPort",
          "Device A Port",
          "fanSlot",
          "Fan Slot",
          "remoteInterface",
          "Remote Interface",
        ],
        ""
      )
    : "";
  return `${deviceName}|${normalizeSectionKey(sectionTitle)}|${idx}|${primaryIdentifier}`;
}

function mapDynamicValidationRow(
  raw: unknown,
  deviceName: string,
  sectionTitle: string,
  idx: number
): ValidationTableRow {
  const record = asRecord(raw);
  if (!record) {
    return {
      _key: buildValidationRowKey(deviceName, sectionTitle, idx, null),
      value: raw === null || raw === undefined ? "" : String(raw),
    };
  }

  return {
    ...record,
    deviceARack: textOrEmpty(record["deviceARack"] ?? record["Device A Rack"]),
    deviceAName: textOrEmpty(record["deviceAName"] ?? record["Device A Name"]),
    deviceAPort: textOrEmpty(record["deviceAPort"] ?? record["Device A Port"]),
    deviceAPortDisplayName: textOrEmpty(
      record["deviceAPortDisplayName"] ??
      record["Alt Device A Port"] ??
      record[" Device A Port"] ??
      record["Device A Port"] ??
      record["deviceAPort"]
    ),
    deviceALocation: textOrEmpty(record["deviceALocation"] ?? record["Device A Location"]),
    currentDeviceBRack: textOrEmpty(
      record["currentDeviceBRack"] ?? record["Current Device B Rack"]
    ),
    currentDeviceBName: textOrEmpty(
      record["currentDeviceBName"] ?? record["Current Device B Name"]
    ),
    currentDeviceBPort: textOrEmpty(
      record["currentDeviceBPort"] ?? record["Current Device B Port"]
    ),
    currentDeviceBPortDisplayName: textOrEmpty(
      record["currentDeviceBPortDisplayName"] ??
      record["Alt Current Device B Port"] ??
      record[" Current Device B Port"] ??
      record["Current Device B Port"] ??
      record["currentDeviceBPort"]
    ),
    currentBLocation: textOrEmpty(record["currentBLocation"] ?? record["Current B Location"]),
    expectedDeviceBRack: textOrEmpty(
      record["expectedDeviceBRack"] ?? record["Expected Device B Rack"]
    ),
    expectedDeviceBName: textOrEmpty(
      record["expectedDeviceBName"] ?? record["Expected Device B Name"]
    ),
    expectedDeviceBPort: textOrEmpty(
      record["expectedDeviceBPort"] ?? record["Expected Device B Port"]
    ),
    expectedDeviceBPortDisplayName: textOrEmpty(
      record["expectedDeviceBPortDisplayName"] ??
      record["Alt Expected Device B Port"] ??
      record[" Expected Device B Port"] ??
      record["Expected Device B Port"] ??
      record["expectedDeviceBPort"]
    ),
    expectedBLocation: textOrEmpty(
      record["expectedBLocation"] ?? record["Expected B Location"]
    ),
    linkStatus: textOrEmpty(record["linkStatus"] ?? record["LLDP Status"]),
    sourceDeviceName: textOrEmpty(
      record["sourceDeviceName"] ?? record["Source Device Name"]
    ),
    sourceDevicePort: textOrEmpty(
      record["sourceDevicePort"] ?? record["Source Device Port"]
    ),
    sourceDeviceLocation: textOrEmpty(
      record["sourceDeviceLocation"] ?? record["Source Device Location"]
    ),
    remoteDeviceName: textOrEmpty(
      record["remoteDeviceName"] ?? record["Remote Device Name"]
    ),
    remoteDevicePort: textOrEmpty(
      record["remoteDevicePort"] ?? record["Remote Device Port"]
    ),
    deviceRack: textOrEmpty(record["deviceRack"] ?? record["Device Rack"]),
    validationDeviceName: deviceName,
    deviceName: textOrEmpty(record["deviceName"] ?? record["Device Name"]),
    devicePort: textOrEmpty(
      record["devicePort"] ?? record["Device Port"] ?? record["Interface"]
    ),
    txPower: textOrEmpty(record["txPower"] ?? record["Tx Power"]),
    rxPower: textOrEmpty(record["rxPower"] ?? record["Rx Power"]),
    opticalRawBer: textOrEmpty(
      record["opticalRawBer"] ?? record["Optical RawBer"] ?? record["raw_ber"] ?? record["rawBer"]
    ),
    preFecBer: textOrEmpty(record["preFecBer"] ?? record["PRE_FEC_BER"]),
    laneValues: textOrEmpty(record["laneValues"] ?? record["Lane Values"]),
    lockStatus: textOrEmpty(record["lockStatus"] ?? record["Lock Status"]),
    remoteDevice: textOrEmpty(record["remoteDevice"] ?? record["Remote Device"]),
    remoteInterface: textOrEmpty(record["remoteInterface"] ?? record["Remote Interface"]),
    fanName: textOrEmpty(record["fanName"] ?? record["Fan Name"]),
    fanSlot: textOrEmpty(record["fanSlot"] ?? record["Fan Slot"]),
    status: textOrEmpty(record["status"] ?? record["Status"]),
    issue: textOrEmpty(record["issue"] ?? record["Issue"]),
    errorMessage: textOrEmpty(record["errorMessage"] ?? record["Error Message"]),
    _key:
      textOrEmpty(record["_key"]) ||
      buildValidationRowKey(deviceName, sectionTitle, idx, record),
  };
}

function setValidationSectionRows(
  device: DeviceValidationFailures,
  sectionTitle: string,
  rows: ValidationTableRow[]
): void {
  const sectionKey = normalizeSectionKey(sectionTitle);
  device.sections[sectionKey] = {
    key: sectionKey,
    title: sectionTitle,
    rows,
  };
  if (!device.sectionOrder.includes(sectionKey)) {
    device.sectionOrder.push(sectionKey);
  }
}

function normalizeLegacyValidationRows(
  rows: ValidationFailure[]
): ValidationFailuresByDevice {
  const byDevice: ValidationFailuresByDevice = {};

  rows.forEach((row, idx) => {
    const deviceName = text(row.deviceAName, "Unknown");
    if (!byDevice[deviceName]) {
      byDevice[deviceName] = buildEmptyDeviceValidationFailures(deviceName);
    }
    const current = byDevice[deviceName];

    const lldpRows = current.sections[normalizeSectionKey("LLDP Errors")]?.rows || [];
    lldpRows.push({
      _key: `${deviceName}|legacy-lldp|${idx}|${textOrEmpty(row.deviceAPort)}`,
      deviceARack: text(row.deviceARack),
      deviceAName: deviceName,
      deviceAPort: text(row.deviceAPort),
      currentDeviceBRack: text(row.deviceBRack),
      currentDeviceBName: text(row.deviceBName),
      currentDeviceBPort: text(row.deviceBPort),
      expectedDeviceBRack: text(row.deviceBRackExpected),
      expectedDeviceBName: text(row.deviceBNameExpected),
      expectedDeviceBPort: text(row.deviceBPortExpected),
      linkStatus: text(row.lldpStatus || row.linkStatus),
      errorMessage: "",
    });
    setValidationSectionRows(current, "LLDP Errors", lldpRows);

    const hasOptics = textOrEmpty(row.txPower) !== "" || textOrEmpty(row.rxPower) !== "";
    if (hasOptics) {
      const opticRows = current.sections[normalizeSectionKey("Optic Errors")]?.rows || [];
      opticRows.push({
        _key: `${deviceName}|legacy-optics|${idx}|${textOrEmpty(row.deviceAPort)}`,
        deviceName,
        devicePort: text(row.deviceAPort),
        txPower: text(row.txPower),
        rxPower: text(row.rxPower),
      });
      setValidationSectionRows(current, "Optic Errors", opticRows);
    }

    const psuFailure = textOrEmpty(row.psuFailure);
    if (psuFailure !== "" && psuFailure.toLowerCase() !== "null") {
      current.powerRows.push({
        _key: `${deviceName}|legacy-power|${idx}`,
        deviceName,
      });
    }
  });

  Object.keys(byDevice).forEach((deviceName) => {
    byDevice[deviceName] = finalizeCounts(byDevice[deviceName]);
  });

  return byDevice;
}

function getSectionCount(
  failures: DeviceValidationFailures,
  sectionTitle: string
): number {
  return failures.counts.bySection[normalizeSectionKey(sectionTitle)] || 0;
}

function normalizeHostTransceiverStatus(value: unknown): "pass" | "fail" | "stale" | "" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["pass", "passed", "success", "ok", "healthy"].includes(normalized)) {
    return "pass";
  }
  if (["fail", "failed", "failure", "error", "critical", "down"].includes(normalized)) {
    return "fail";
  }
  if (["stale", "missing", "not available", "n/a", "na", "unknown", "no data", "pending"].includes(normalized)) {
    return "stale";
  }
  return normalized === "" ? "" : "stale";
}

function rowHasAnyValue(row: ValidationTableRow, keys: string[]): boolean {
  return keys.some((key) => String(row[key] ?? "").trim() !== "");
}

function isHostTransceiverActionableMetric(
  row: ValidationTableRow,
  metricKeys: string[],
  statusKeys: string[]
): boolean {
  const metricStatuses = statusKeys
    .map((key) => normalizeHostTransceiverStatus(row[key]))
    .filter((status): status is "pass" | "fail" | "stale" => status !== "");

  if (metricStatuses.some((status) => status === "fail" || status === "stale")) {
    return true;
  }

  if (metricStatuses.some((status) => status === "pass")) {
    return false;
  }

  if (!rowHasAnyValue(row, metricKeys)) {
    return true;
  }

  const validationStatus = normalizeHostTransceiverStatus(row["Validation Status"]);
  return validationStatus === "fail" || validationStatus === "stale";
}

function getHostTransceiverActionableCounts(
  failures: DeviceValidationFailures
): { optics: number; fecBer: number; total: number } {
  return failures.sectionOrder.reduce((counts, sectionKey) => {
    const section = failures.sections[sectionKey];
    if (!section || normalizeSectionKey(section.title) !== normalizeSectionKey("GPU Host Transceiver")) {
      return counts;
    }

    const opticsCount = section.rows.filter((row) =>
      isHostTransceiverActionableMetric(row, ["RX Power (dBm)"], ["RX Status"])
    ).length;
    const fecBerCount = section.rows.filter((row) =>
      isHostTransceiverActionableMetric(row, ["Raw BER"], ["Raw BER Status"])
    ).length;

    return {
      optics: counts.optics + opticsCount,
      fecBer: counts.fecBer + fecBerCount,
      total: counts.total + opticsCount + fecBerCount,
    };
  }, { optics: 0, fecBer: 0, total: 0 });
}

function toNormalizedNameSet(
  deviceNames?: Iterable<string>
): Set<string> | null {
  if (!deviceNames) {
    return null;
  }

  const names = Array.from(deviceNames)
    .map((deviceName) => normalizeDeviceName(deviceName))
    .filter((deviceName) => deviceName !== "");

  return new Set(names);
}

export function getHostTransceiverMetricDisplayDeviceNames(
  hostReadinessItems: Iterable<Record<string, unknown>>
): string[] {
  const names = new Set<string>();

  Array.from(hostReadinessItems).forEach((item) => {
    const status = String(item["status"] ?? "").trim();
    if (!shouldDisplayHostTransceiverMetrics(status)) {
      return;
    }

    const deviceName = String(
      item["deviceName"] ?? item["hostName"] ?? item["host"] ?? ""
    ).trim();
    if (deviceName) {
      names.add(deviceName);
    }
  });

  return Array.from(names);
}
