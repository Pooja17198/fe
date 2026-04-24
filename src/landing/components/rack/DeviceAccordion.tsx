import { h } from "preact";
import { useMemo, useState, useEffect, useRef } from "preact/hooks";
import "ojs/ojaccordion";
import "ojs/ojcollapsible";
import "ojs/ojtable";
import "oj-c/button";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

import {
  DeviceStatus,
  DeviceValidationFailures,
  PatchPanelRackRows,
  PatchPanelRow,
  ValidationFailuresByDevice,
} from "./types";
import { VALIDATION_TABLE_ACCESSIBILITY } from "./constants";
import {
  FAN_FAILURE_COLUMNS,
  FEC_BER_FAILURE_COLUMNS,
  GPU_COMPUTE_INTERFACE_FAILURE_COLUMNS,
  GPU_COMPUTE_LLDP_FAILURE_COLUMNS,
  GPU_COMPUTE_OPTIC_FAILURE_COLUMNS,
  INTERFACE_FAILURE_COLUMNS,
  LLDP_FAILURE_COLUMNS,
  OPTIC_FAILURE_COLUMNS,
} from "./columns";
import {
  booleanStatusTemplate,
  currentBLocationTemplate,
  deviceALocationTemplate,
  errorMessageClampTemplate,
  expectedBLocationTemplate,
  gpuLldpErrorDetailsTemplate,
  gpuMultilineErrorMessageTemplate,
  lldpStatusTemplate,
  patchPanelMatrixTemplate,
  psuStatusTemplate,
  txPowerTemplate,
  rxPowerTemplate,
  sourceDeviceLocationTemplate,
} from "./templates";
import { formatStatusLabel, getStatusClass, isDeviceStatusCompleted, isGpuComputeDevice } from "./utils";
type ValidationAgeColor = "green" | "orange" | "red";

const VALIDATION_AGE_THRESHOLDS_MS = {
  // when currentTime - lastValidated <= GREEN_MAX then display green color
  // else when currentTime - lastValidated <= ORANGE_MAX then display orange color
  // else display red color
  GREEN_MAX: 10 * 60 * 1000,
  ORANGE_MAX: 60 * 60 * 1000,
} as const;

const RELATIVE_TIME_UNITS = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
} as const;

function parseLastValidatedTimestampMs(lastValidatedAt?: string | null): number | null {
  if (!lastValidatedAt || lastValidatedAt.trim() === "") return null;
  const parsedTimestampMs = Date.parse(lastValidatedAt);
  return Number.isFinite(parsedTimestampMs) ? parsedTimestampMs : null;
}

function resolveValidationAgeColor(
    lastValidatedAt: string | null | undefined,
    referenceTimeMs: number
): ValidationAgeColor {
  const lastValidatedTimestampMs = parseLastValidatedTimestampMs(lastValidatedAt);
  if (lastValidatedTimestampMs === null) return "red";

  const elapsedSinceValidationMs = Math.max(0, referenceTimeMs - lastValidatedTimestampMs);
  if (elapsedSinceValidationMs <= VALIDATION_AGE_THRESHOLDS_MS.GREEN_MAX) return "green";
  if (elapsedSinceValidationMs <= VALIDATION_AGE_THRESHOLDS_MS.ORANGE_MAX) return "orange";
  return "red";
}

function formatRelativeValidationAge(
    lastValidatedAt: string | null | undefined,
    referenceTimeMs: number
): string {
  const lastValidatedTimestampMs = parseLastValidatedTimestampMs(lastValidatedAt);
  if (lastValidatedTimestampMs === null) return "Unknown";

  const elapsedSinceValidationMs = Math.max(0, referenceTimeMs - lastValidatedTimestampMs);
  const elapsedSeconds = Math.floor(elapsedSinceValidationMs / 1000);

  if (elapsedSinceValidationMs < RELATIVE_TIME_UNITS.minute) {
    const seconds = Math.max(1, elapsedSeconds);
    return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  }

  if (elapsedSinceValidationMs < RELATIVE_TIME_UNITS.hour) {
    const minutes = Math.floor(elapsedSinceValidationMs / RELATIVE_TIME_UNITS.minute);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  if (elapsedSinceValidationMs < RELATIVE_TIME_UNITS.day) {
    const hours = Math.floor(elapsedSinceValidationMs / RELATIVE_TIME_UNITS.hour);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  if (elapsedSinceValidationMs < RELATIVE_TIME_UNITS.week) {
    const days = Math.floor(elapsedSinceValidationMs / RELATIVE_TIME_UNITS.day);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  const weeks = Math.floor(elapsedSinceValidationMs / RELATIVE_TIME_UNITS.week);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

function getNextValidationColorTransitionAtMs(
    lastValidatedAt: string | null | undefined,
    referenceTimeMs: number
): number | null {
  const lastValidatedTimestampMs = parseLastValidatedTimestampMs(lastValidatedAt);
  if (lastValidatedTimestampMs === null) return null;

  const elapsedSinceValidationMs = Math.max(0, referenceTimeMs - lastValidatedTimestampMs);
  if (elapsedSinceValidationMs <= VALIDATION_AGE_THRESHOLDS_MS.GREEN_MAX) {
    return lastValidatedTimestampMs + VALIDATION_AGE_THRESHOLDS_MS.GREEN_MAX + 50;
  }
  if (elapsedSinceValidationMs < VALIDATION_AGE_THRESHOLDS_MS.ORANGE_MAX) {
    return lastValidatedTimestampMs + VALIDATION_AGE_THRESHOLDS_MS.ORANGE_MAX + 50;
  }
  return null;
}

function isDeviceNotEligibleForValidation(
    device: DeviceStatus,
    _deviceFailures: DeviceValidationFailures
): boolean {
  // Eligibility is computed upstream in useRackValidation and attached on DeviceStatus.
  // Treat explicit false as not eligible; undefined stays backward-compatible as eligible.
  return device.validationEligible === false;
}

type Props = {
  devices: DeviceStatus[];
  eligibleDeviceNames: Set<string>;
  building: string;
  block: string;
  rack: string;
  rack_serial: string;
  isGpuRack?: boolean;
  region: string;
  validationFailuresByDevice: ValidationFailuresByDevice;
  patchPanelRackRows: PatchPanelRackRows;
  totalFailureRows: number;
  totalLinkFailureRows: number;
  powerFailureDevices: number;
  selectedLinkKeys: Set<string>;
  setSelectedLinkKeys: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  loading: boolean;
  isValidating: boolean;
  hideUnsupported: boolean;
  rackValidationAllowed: boolean;
  rackValidationTooltip: string;
  externalExpandedKeys?: Set<string>;
  externalExpandedKeysNonce?: number;
};

function normalizeDeviceName(value: string | undefined | null): string {
  return String(value || "").trim().toLowerCase();
}

function isUsableLookupValue(value: string | undefined | null): boolean {
  const normalized = normalizeDeviceName(value);
  return !["", "unknown", "n/a", "na", "-"].includes(normalized);
}

function getLookupValue(
  primary: string | undefined | null,
  fallback?: string | undefined | null
): string {
  if (isUsableLookupValue(primary)) {
    return String(primary ?? "").trim();
  }

  if (isUsableLookupValue(fallback)) {
    return String(fallback ?? "").trim();
  }

  return "";
}

function toDevicePortKey(deviceName: string | undefined | null, devicePort: string | undefined | null): string {
  return `${normalizeDeviceName(deviceName)}|${normalizeDeviceName(devicePort)}`;
}

function normalizePortMembership(devicePort: string | undefined | null): { basePort: string; members: number[] } | null {
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
      .sort((a, b) => a - b);

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

type PatchPanelLookupMap = Record<string, PatchPanelRow[]>;

type TestSectionConfig = {
  id: "lldp" | "optics" | "interfaces" | "fecBer" | "fans";
  title: string;
  columns: any[];
};

const TEST_SECTIONS: TestSectionConfig[] = [
  { id: "interfaces", title: "Interface Errors", columns: INTERFACE_FAILURE_COLUMNS },
  { id: "lldp", title: "LLDP Errors", columns: LLDP_FAILURE_COLUMNS },
  { id: "optics", title: "Optic Errors", columns: OPTIC_FAILURE_COLUMNS },
  { id: "fecBer", title: "FEC_BER Errors", columns: FEC_BER_FAILURE_COLUMNS },
  { id: "fans", title: "Fan Errors", columns: FAN_FAILURE_COLUMNS },
];

const EMPTY_DEVICE_FAILURES: DeviceValidationFailures = {
  deviceName: "",
  lastValidated: null,
  tests: {
    lldp: [],
    optics: [],
    interfaces: [],
    fecBer: [],
    fans: [],
    power: [],
  },
  counts: {
    lldp: 0,
    optics: 0,
    interfaces: 0,
    fecBer: 0,
    fans: 0,
    power: 0,
    nonPowerTotal: 0,
    overallTotal: 0,
  },
  hasPsuFailure: false,
};


function getSectionColumns(
  section: TestSectionConfig,
  sectionRows: any[],
  isGpuCompute: boolean,
): any[] {
  const hasTransceiver = sectionRows.some((row) => {
    const transceiver = row?.transceiver;
    return typeof transceiver === "string" && transceiver.trim() !== "";
  });
  const hasErrorMessage = sectionRows.some((row) => {
    const errorMessage = row?.errorMessage;
    return typeof errorMessage === "string" && errorMessage.trim() !== "";
  });

  if (isGpuCompute && section.id === "lldp") {
    return hasErrorMessage
      ? [...GPU_COMPUTE_LLDP_FAILURE_COLUMNS]
      : GPU_COMPUTE_LLDP_FAILURE_COLUMNS.filter((column) => column.id !== "errorMessage");
  }

  if (isGpuCompute && section.id === "optics") {
    const columns = hasErrorMessage
      ? [...GPU_COMPUTE_OPTIC_FAILURE_COLUMNS]
      : GPU_COMPUTE_OPTIC_FAILURE_COLUMNS.filter((column) => column.id !== "errorMessage");
    return hasTransceiver
      ? columns
      : columns.filter((column) => column.id !== "transceiver");
  }

  if (isGpuCompute && section.id === "interfaces") {
    return [...GPU_COMPUTE_INTERFACE_FAILURE_COLUMNS];
  }

  if (section.id === "optics") {
    return hasTransceiver
      ? [...section.columns]
      : section.columns.filter((column) => column.id !== "transceiver");
  }

  if (section.id !== "fecBer") {
    return [...section.columns];
  }

  if (hasErrorMessage) {
    return [...section.columns];
  }

  return section.columns.filter((column) => column.id !== "errorMessage");
}

function buildDeviceFailuresFallback(deviceName: string): DeviceValidationFailures {
  return {
    ...EMPTY_DEVICE_FAILURES,
    deviceName,
  };
}

function getRowsForSection(
    deviceFailures: DeviceValidationFailures,
    section: TestSectionConfig["id"]
): any[] {
  switch (section) {
    case "lldp":
      return deviceFailures.tests.lldp;
    case "optics":
      return deviceFailures.tests.optics;
    case "interfaces":
      return deviceFailures.tests.interfaces;
    case "fecBer":
      return deviceFailures.tests.fecBer;
    case "fans":
      return deviceFailures.tests.fans;
    default:
      return [];
  }
}

function renderPatchPanelValue(rows: PatchPanelRow[]): string {
  if (!rows.length) return "Not Available";

  return rows
    .map((row, idx) => {
      const easyMark = Array.isArray(row.easyMark) ? row.easyMark : [];
      if (easyMark.length > 0) {
        const lines = easyMark.map((v) => `• ${v}`);
        return rows.length > 1
          ? `Entry ${idx + 1}\n${lines.join("\n")}`
          : lines.join("\n");
      }
      return JSON.stringify(row, null, 2);
    })
    .join("\n\n");
}

function isMissingPatchPanelValue(value: unknown): boolean {
  return String(value || "").trim() === "" || String(value || "").trim() === "Not Available";
}

function getRowDeviceAndPort(sectionId: TestSectionConfig["id"], row: any): { deviceName: string; devicePort: string } {
  if (sectionId === "lldp") {
    return {
      deviceName: getLookupValue(row.expectedDeviceBName, row.currentDeviceBName),
      devicePort: getLookupValue(row.expectedDeviceBPort, row.currentDeviceBPort),
    };
  }

  if (sectionId === "optics" || sectionId === "interfaces") {
    return {
      deviceName: getLookupValue(row.remoteDeviceName, row.sourceDeviceName ?? row.deviceName),
      devicePort: getLookupValue(row.remoteDevicePort, row.sourceDevicePort ?? row.devicePort),
    };
  }

  if (sectionId === "fecBer") {
    return {
      deviceName: getLookupValue(row.remoteDevice, row.deviceName),
      devicePort: getLookupValue(row.remoteInterface, row.devicePort),
    };
  }

  return {
    deviceName: getLookupValue(row.remoteDeviceName ?? row.remoteDevice, row.deviceName),
    devicePort: getLookupValue(row.remoteDevicePort ?? row.remoteInterface, row.devicePort),
  };
}

function toLogicalPortFamily(devicePort: string | undefined | null): string {
  const normalizedPort = String(devicePort || "").trim();
  if (!normalizedPort) return "";

  const membership = normalizePortMembership(normalizedPort);
  if (!membership) {
    return normalizedPort.toLowerCase();
  }

  if (membership.members.length > 1) {
    return `${membership.basePort}[${membership.members.join("+")}]`;
  }

  const member = membership.members[0];
  const pairStart = member % 2 === 0 ? member - 1 : member;
  if (pairStart <= 0) {
    return normalizedPort.toLowerCase();
  }

  return `${membership.basePort}[${pairStart}+${pairStart + 1}]`;
}

function addPatchPanelToSectionRows(
  sectionId: TestSectionConfig["id"],
  rows: any[],
  patchPanelByDevicePort: PatchPanelLookupMap
): any[] {
  if (sectionId === "fans") return rows;

  return rows.map((row) => {
    let patchPanelRows: PatchPanelRow[] = [];

    if (sectionId === "lldp") {
      const primaryName = getLookupValue(row.deviceAName);
      const primaryPort = getLookupValue(row.deviceAPort);

      const hasUsablePrimary =
        isUsableLookupValue(primaryName) && isUsableLookupValue(primaryPort);

      if (hasUsablePrimary) {
        const primaryKey = toDevicePortKey(primaryName, primaryPort);
        patchPanelRows = patchPanelByDevicePort[primaryKey] ?? [];

        if (patchPanelRows.length === 0) {
          const expectedName = getLookupValue(row.expectedDeviceBName);
          const expectedPort = getLookupValue(row.expectedDeviceBPort);

          if (isUsableLookupValue(expectedName) && isUsableLookupValue(expectedPort)) {
            const fallbackKey = toDevicePortKey(expectedName, expectedPort);
            patchPanelRows = patchPanelByDevicePort[fallbackKey] ?? [];
          }
        }
      }
    } else {
      const deviceName = getLookupValue(row.deviceName, row.remoteDeviceName ?? row.remoteDevice);
      const devicePort = getLookupValue(row.devicePort, row.remoteDevicePort ?? row.remoteInterface);
      const key = toDevicePortKey(deviceName, devicePort);
      patchPanelRows = patchPanelByDevicePort[key] ?? [];
    }

    return {
      ...row,
      patchPanelMatrix: renderPatchPanelValue(patchPanelRows),
    };
  });
}

function getPsuStatusLabel(jobStatus: string, hasPsuFailure: boolean): "UP" | "DOWN" | "-" {
  const normalized = (jobStatus || "").toUpperCase();
  if (normalized !== "COMPLETED" && normalized !== "DEVICE_UNREACHABLE") {
    return "-";
  }
  return hasPsuFailure ? "DOWN" : "UP";
}

function toAvailabilityDomain(region: string): string {
  const normalizedRegion = String(region || "").trim();
  return normalizedRegion ? `${normalizedRegion}-ad-1` : "";
}

function buildComputeAdminHostUrl(hostSerial: string, region: string): string {
  const availabilityDomain = toAvailabilityDomain(region);
  if (!hostSerial || !availabilityDomain) return "#";
  return `https://devops.oci.oraclecorp.com/compute-admin/hosts/${encodeURIComponent(hostSerial)}?region=${encodeURIComponent(availabilityDomain)}&region=${encodeURIComponent(availabilityDomain)}`;
}

function buildCerebroHostUrl(hostSerial: string, region: string): string {
  const availabilityDomain = toAvailabilityDomain(region);
  if (!hostSerial || !availabilityDomain) return "#";
  return `https://devops.oci.oraclecorp.com/cerebro-ui/HostDetails/${encodeURIComponent(hostSerial)}?region=${encodeURIComponent(availabilityDomain)}`;
}

function buildHopsDeviceUrl(hostSerial: string, region: string): string {
  const normalizedRegion = String(region || "").trim();
  if (!hostSerial || !normalizedRegion) return "#";
  return `https://hops.svc.ad1.${normalizedRegion}/ui/deviceview?serial=${encodeURIComponent(hostSerial)}`;
}

function buildTicketUrl(ticketId: string): string {
  const normalizedTicketId = String(ticketId || "").trim();
  if (!normalizedTicketId) return "#";
  return `https://jira-sd.mc1.oracleiaas.com/projects/LVV/queues/custom/31341/${encodeURIComponent(normalizedTicketId)}`;
}

const HOST_STATE_LEGEND_ITEMS = [
  { state: "HOPS-NEW", description: "Host has not started ingestion", className: "status-error" },
  { state: "HOPS-TESTING", description: "HOPS is actively ingesting this host", className: "status-error" },
  { state: "HOPS-REPAIR", description: "HOPS has cut a repair ticket and is waiting on the repair", className: "status-error" },
  { state: "CPV-EMPTY", description: "Host is ready for CPV, but no instance is launched.", className: "status-cpv" },
  { state: "CPV-INIT", description: "Host has started CPV", className: "status-cpv" },
  { state: "LVV", description: "Host is waiting for LVV validation to complete on the deployment group", className: "status-completed" },
  { state: "CPV-TESTING", description: "CPV is running tests", className: "status-cpv" },
  { state: "CPV-REPAIR", description: "CPV is waiting on a repair ticket", className: "status-cpv" },
  { state: "CUSTOMER-EMPTY", description: "Host is ready for a customer, but no instance is launched", className: "status-customer" },
  { state: "CUSTOMER", description: "Customer is running an instance on the host.", className: "status-customer" },
];

const HOST_STATE_LEGEND_ARIA_LABEL = HOST_STATE_LEGEND_ITEMS
  .map((item) => `${item.state}: ${item.description}`)
  .join(". ");

const LAST_VALIDATED_LEGEND_ITEMS = [
  { label: "Green", description: "Up to 10 minutes", className: "green" },
  { label: "Orange", description: "Up to 1 hour", className: "orange" },
  { label: "Red", description: "Greater than 1 hour", className: "red" },
  { label: "N/A", description: "Not eligible for validation", className: "na" },
];

const LAST_VALIDATED_LEGEND_ARIA_LABEL = LAST_VALIDATED_LEGEND_ITEMS
  .map((item) => `${item.label}: ${item.description}`)
  .join(". ");

function renderDeviceInformationSection(
  device: DeviceStatus,
  idx: number,
  accessibility: typeof VALIDATION_TABLE_ACCESSIBILITY,
  region: string
) {
  const readinessStatus = String(device.hostReadinessStatus || "").trim().toUpperCase();
  const deviceName = String(device.deviceName || "").trim() || "-";
  const hostSerial = String(device.hostSerial || "").trim();
  const instanceId = device.hostInstanceId == null ? "-" : String(device.hostInstanceId).trim() || "-";
  const hopsState = String(device.hostHopsState || "").trim() || "-";
  const computeState = String(device.hostComputeState || "").trim() || "-";
  const computePool = String(device.hostComputePool || "").trim() || "-";
  const ticketIds = Array.isArray(device.hostTicketIds) ? device.hostTicketIds.filter((ticketId) => String(ticketId).trim() !== "") : [];
  const lvvTicketIds = ticketIds.filter((ticketId) => String(ticketId).trim().toUpperCase().startsWith("LVV"));
  const repairTicketIds = ticketIds.filter((ticketId) => !String(ticketId).trim().toUpperCase().startsWith("LVV"));

  if (!readinessStatus || !hostSerial) {
    return null;
  }

  const showTicketIds = readinessStatus === "LVV";
  const rows = [
    {
      label: "Device Name",
      value: hostSerial ? (
        <a href={buildCerebroHostUrl(hostSerial, region)} target="_blank" rel="noopener noreferrer">
          {deviceName}
        </a>
      ) : deviceName,
    },
    {
      label: "Host Serial",
      value: hostSerial ? (
        <a href={buildComputeAdminHostUrl(hostSerial, region)} target="_blank" rel="noopener noreferrer">
          {hostSerial}
        </a>
      ) : "-",
    },
    {
      label: "Instance ID",
      value: hostSerial && instanceId !== "-" ? (
        <a href={buildComputeAdminHostUrl(hostSerial, region)} target="_blank" rel="noopener noreferrer">
          {instanceId}
        </a>
      ) : instanceId,
    },
    {
      label: "Hops State",
      value: hostSerial && hopsState !== "-" ? (
        <a href={buildHopsDeviceUrl(hostSerial, region)} target="_blank" rel="noopener noreferrer">
          {hopsState}
        </a>
      ) : hopsState,
    },
    { label: "Compute State", value: computeState },
    { label: "Compute Pool", value: computePool },
    ...(showTicketIds && lvvTicketIds.length > 0
      ? [{
          label: "LVV Tickets",
          value: (
            <span>
              {lvvTicketIds.map((ticketId, index) => (
                <span key={ticketId}>
                  <a href={buildTicketUrl(ticketId)} target="_blank" rel="noopener noreferrer">
                    {ticketId}
                  </a>
                  {index < lvvTicketIds.length - 1 ? ", " : ""}
                </span>
              ))}
            </span>
          ),
        }]
      : []),
    ...(showTicketIds && repairTicketIds.length > 0
      ? [{
          label: "Repair Tickets",
          value: (
            <span>
              {repairTicketIds.map((ticketId, index) => (
                <span key={ticketId}>
                  <a href={buildTicketUrl(ticketId)} target="_blank" rel="noopener noreferrer">
                    {ticketId}
                  </a>
                  {index < repairTicketIds.length - 1 ? ", " : ""}
                </span>
              ))}
            </span>
          ),
        }]
      : []),
  ];

  return (
    <oj-collapsible
      id={`device-${idx}-device-information`}
      key={`${device.deviceName}-device-information`}
      expanded={false}
    >
      <h4 slot="header" className="test-section-header">
        <span>Device Information</span>
      </h4>
      <div className="oj-flex device-information-section-body">
        <div className="oj-flex-item rack-panel table-wrapper-full device-information-section-panel">
          <div className="device-information-list" aria-label="Device Information" role="table">
            {rows.map((row) => (
              <div className="device-information-row" key={`${device.deviceName}-${row.label}`} role="row">
                <div className="device-information-label" role="rowheader">{row.label} :</div>
                <div className="device-information-value" role="cell">{row.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </oj-collapsible>
  );
}

const DeviceAccordion = (props: Props) => {
  const ACC = VALIDATION_TABLE_ACCESSIBILITY;
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [accordionNonce, setAccordionNonce] = useState(0);
  const [validationReferenceTimeMs, setValidationReferenceTimeMs] = useState<number>(Date.now());

  useEffect(() => {
    if (typeof props.externalExpandedKeysNonce === "number") {
      setAccordionNonce((n) => n + 1);
      const next = props.externalExpandedKeys ? new Set(props.externalExpandedKeys) : new Set<string>();
      setExpandedKeys(next);
    }
  }, [props.externalExpandedKeysNonce, props.externalExpandedKeys]);

  const filteredFailuresByDevice = useMemo(() => {
    const filtered: ValidationFailuresByDevice = {};
    Object.entries(props.validationFailuresByDevice).forEach(([deviceName, deviceFailures]) => {
      const filteredLldp = props.hideUnsupported
          ? deviceFailures.tests.lldp.filter(
              (row) => String(row.linkStatus).toUpperCase() !== "UNSUPPORTED"
          )
          : deviceFailures.tests.lldp;

      const counts = {
        lldp: filteredLldp.length,
        optics: deviceFailures.tests.optics.length,
        interfaces: deviceFailures.tests.interfaces.length,
        fecBer: deviceFailures.tests.fecBer.length,
        fans: deviceFailures.tests.fans.length,
        power: deviceFailures.tests.power.length,
        nonPowerTotal:
            filteredLldp.length +
            deviceFailures.tests.optics.length +
            deviceFailures.tests.interfaces.length +
            deviceFailures.tests.fecBer.length +
            deviceFailures.tests.fans.length,
        overallTotal:
            filteredLldp.length +
            deviceFailures.tests.optics.length +
            deviceFailures.tests.interfaces.length +
            deviceFailures.tests.fecBer.length +
            deviceFailures.tests.fans.length +
            deviceFailures.tests.power.length,
      };

      filtered[deviceName] = {
        ...deviceFailures,
        tests: {
          ...deviceFailures.tests,
          lldp: filteredLldp,
        },
        counts,
        hasPsuFailure: deviceFailures.tests.power.length > 0,
      };
    });

    return filtered;
  }, [props.validationFailuresByDevice, props.hideUnsupported]);

 const patchPanelByDevicePort = useMemo(() => {
   return props.patchPanelRackRows.reduce((acc, panelRow) => {
     const keys = buildPatchPanelLookupKeys(panelRow.deviceName, panelRow.devicePort);
     keys.forEach((key) => {
       if (!acc[key]) acc[key] = [];
       if (!acc[key].includes(panelRow)) {
         acc[key].push(panelRow);
       }
     });
     return acc;
   }, {} as PatchPanelLookupMap);
 }, [props.patchPanelRackRows]);

  const selectTemplate = (context: any, disabled: boolean = false, disabledReason: string = "") => {
    const row = (context?.item && context.item.data) || {};
    const key = row._key;
    const isChecked = props.selectedLinkKeys.has(key);
    const onChange = (e: any) => {
      const checked = (e.target as HTMLInputElement).checked;
      props.setSelectedLinkKeys((prev) => {
        const next = new Set(prev as Set<string>);
        if (checked) next.add(key);
        else next.delete(key);
        return next;
      });
    };
    return (
        <input
            type="checkbox"
            checked={isChecked}
            onChange={onChange}
            disabled={disabled}
            title={disabled ? disabledReason || "Validation is available only for monitored and deployed devices." : ""}
        />
    );
  };

  const gpuRackSelectionDisabled = Boolean(props.isGpuRack);
  const gpuRackSelectionDisabledReason = "Device selection is disabled for GPU racks.";

  const handleToggle = (key: string, expand: boolean, hasDeviceFailures: boolean) => {
    // Only allow expanding if there are device failures
    if (expand && !hasDeviceFailures) return;
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (expand) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const sortedDevices = useMemo(() => {
    return [...props.devices].sort((a, b) => (b.elevation ?? -Infinity) - (a.elevation ?? -Infinity));
  }, [props.devices]);

  useEffect(() => {
    setValidationReferenceTimeMs(Date.now());
  }, [props.validationFailuresByDevice]);

  useEffect(() => {
    const currentTimeMs = Date.now();
    const upcomingColorTransitionTimesMs = sortedDevices
        .map((device) => {
          const deviceFailures =
              filteredFailuresByDevice[device.deviceName] || buildDeviceFailuresFallback(device.deviceName);
          if (isDeviceNotEligibleForValidation(device, deviceFailures)) {
            return null;
          }
          if (!isDeviceStatusCompleted(device.jobStatus)) {
            return null;
          }
          return getNextValidationColorTransitionAtMs(deviceFailures.lastValidated ?? null, currentTimeMs);
        })
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    if (upcomingColorTransitionTimesMs.length === 0) {
      return;
    }

    // Schedule only the nearest upcoming transition time across all devices.
    const earliestTransitionTimeMs = Math.min(...upcomingColorTransitionTimesMs);
    // Keep a minimum 1s delay to avoid immediate/negative timer jitter near boundary.
    const waitDurationMs = Math.max(1000, earliestTransitionTimeMs - currentTimeMs);
    const transitionTimeoutId = window.setTimeout(() => {
      setValidationReferenceTimeMs(Date.now());
    }, waitDurationMs);

    return () => {
      window.clearTimeout(transitionTimeoutId);
    };
  }, [sortedDevices, filteredFailuresByDevice, validationReferenceTimeMs]);

  // Compute selection helpers for "Select All" behavior
  const eligibleDeviceKeys = useMemo(
      () =>
          new Set(
              sortedDevices
                  .filter((device) => props.eligibleDeviceNames.has(device.deviceName))
                  .map((device) => device._key)
          ),
      [sortedDevices, props.eligibleDeviceNames]
  );
  const allSelected =
      eligibleDeviceKeys.size > 0 &&
      Array.from(eligibleDeviceKeys).every((k) => props.selectedLinkKeys.has(k));
  const someSelected =
      eligibleDeviceKeys.size > 0 &&
      Array.from(eligibleDeviceKeys).some((k) => props.selectedLinkKeys.has(k)) &&
      !allSelected;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected, allSelected, props.selectedLinkKeys, sortedDevices]);

  const toggleSelectAll = (checked: boolean) => {
    if (!props.rackValidationAllowed) {
      return;
    }
    props.setSelectedLinkKeys((prev) => {
      const next = new Set(prev as Set<string>);
      if (checked) {
        eligibleDeviceKeys.forEach((k) => next.add(k));
      } else {
        eligibleDeviceKeys.forEach((k) => next.delete(k));
      }
      return next;
    });
  };

  const summaryCounts = useMemo(() => {
    const values = Object.values(filteredFailuresByDevice);
    const linkFailures = values.reduce((sum, item) => sum + item.counts.nonPowerTotal, 0);
    const powerFailures = values.filter(
        (item) => !isGpuComputeDevice(item.deviceName, props.isGpuRack) && item.hasPsuFailure
    ).length;
    return { linkFailures, powerFailures };
  }, [filteredFailuresByDevice, props.isGpuRack]);

  const renderErrorCount = (device: DeviceStatus, deviceFailures: DeviceValidationFailures) => {
    const isGpuCompute = isGpuComputeDevice(device.deviceName, props.isGpuRack);
    const chips = isGpuCompute
        ? [
          { label: "INT", count: deviceFailures.counts.interfaces },
          { label: "LLDP", count: deviceFailures.counts.lldp },
          { label: "OPT", count: deviceFailures.counts.optics },
          { label: "FEC", count: deviceFailures.counts.fecBer },
        ].filter((entry) => entry.count > 0)
        : [
          { label: "INT", count: deviceFailures.counts.interfaces },
          { label: "LLDP", count: deviceFailures.counts.lldp },
          { label: "OPT", count: deviceFailures.counts.optics },
          { label: "FEC", count: deviceFailures.counts.fecBer },
          { label: "FAN", count: deviceFailures.counts.fans },
        ].filter((entry) => entry.count > 0);

    if (chips.length === 0) {
      const zeroClass = `device-accordion-failure-count ${
          !isGpuCompute && deviceFailures.hasPsuFailure
              ? "danger"
              : "success"
      }`;
      return <span className={zeroClass}>0</span>;
    }

    return (
        <span className="device-accordion-error-breakdown">
         {chips.map((chip) => {
           const typeClass =
               chip.label === "LLDP" ? "chip-lldp" :
                   chip.label === "OPT"  ? "chip-opt"  :
                       chip.label === "INT"  ? "chip-int"  :
                           chip.label === "FEC"  ? "chip-fec"  :
                               chip.label === "FAN"  ? "chip-fan"  : "";
           return (
               <span
                   key={chip.label}
                   className={`device-accordion-error-chip ${typeClass}`}
                   title={`${chip.label}: ${chip.count}`}
               >
                {chip.label}:{chip.count}
              </span>
           );
         })}
      </span>
    );
  };

  const renderLastValidated = (device: DeviceStatus, deviceFailures: DeviceValidationFailures) => {
    if (isDeviceNotEligibleForValidation(device, deviceFailures)) {
      return <span className="device-last-validated-na">N/A</span>;
    }

    if (!isDeviceStatusCompleted(device.jobStatus)) {
      return null;
    }

    const validationColor = resolveValidationAgeColor(deviceFailures.lastValidated, validationReferenceTimeMs);
    const relativeValidationAge = formatRelativeValidationAge(deviceFailures.lastValidated, validationReferenceTimeMs);
    return (
        <span
            className={`device-last-validated-pill ${validationColor}`}
            title={relativeValidationAge}
            aria-label={`Last validated ${relativeValidationAge}`}
        >
          {relativeValidationAge}
        </span>
    );
  };

  const renderValidationState = (device: DeviceStatus, isGpuCompute: boolean) => {
    if (!isGpuCompute) {
      return <span className="device-last-validated-na">N/A</span>;
    }

    if (device.hostReadinessLoading) {
      return (
        <span className="device-host-state-loading" aria-label="Host state loading" title="Host state loading">
          <oj-progress-circle size="sm" value={-1} />
        </span>
      );
    }

    const readinessStatus = String(device.hostReadinessStatus || "").trim();
    const readinessStatusUpper = readinessStatus.toUpperCase();
    if (readinessStatus !== "") {
      const readinessClass =
        readinessStatusUpper.startsWith("HOPS-")
          ? "status-error"
          : readinessStatusUpper.startsWith("CPV-")
          ? "status-cpv"
          : readinessStatusUpper === "LVV"
          ? "status-completed"
          : readinessStatusUpper.startsWith("CUSTOMER-") || readinessStatusUpper === "CUSTOMER"
          ? "status-customer"
          : "status-not-triggered";

      return <span className={`device-accordion-status ${readinessClass}`}>{readinessStatus}</span>;
    }

    return <span className="device-accordion-unknown">-</span>;
  };

  return (
      <div class="rack-page">
        {props.loading ? (
            <div class="device-accordion-loader">
              <oj-progress-circle size="md" value={-1} />
            </div>
        ) : props.devices.length > 0 ? (
            <div>
              {/*Validation summary*/}
              {!props.isValidating &&
                  (() => {
                    const eligibleDevices = props.devices.filter((d) =>
                        props.eligibleDeviceNames.has(d.deviceName)
                    );
                    const hasEligibleDevices = eligibleDevices.length > 0;
                    const numUnreachable = eligibleDevices.filter((d) => d.jobStatus === "DEVICE_UNREACHABLE").length;
                    const hasAnyValidated = eligibleDevices.some(
                        (d) => d.jobStatus !== "NOT_TRIGGERED" && d.jobStatus !== "IN_PROGRESS"
                    );
                    if (!hasEligibleDevices) {
                      return (
                          <div class="device-accordion-summary-card info">
                            <div>
                              <span class="device-accordion-message-title">
                                All devices are listed below.
                              </span>
                              <span class="device-accordion-message-title">
                                Validation can only be run on devices in monitored and deployed state.
                              </span>
                            </div>
                          </div>
                      );
                    }
                    if (hasAnyValidated) {
                      return (
                          <div class="device-accordion-summary-card info">
                            <div>
                      <span class="device-accordion-message-title">
                        {summaryCounts.linkFailures} link-level validation failure(s)
                      </span>
                              <span class="device-accordion-message-title">{numUnreachable} device(s) are unreachable</span>
                              <span class="device-accordion-message-title">
                        {summaryCounts.powerFailures} device(s) have PSU failure(s)
                      </span>
                            </div>
                          </div>
                      );
                    } else {
                      return (
                          <div class="device-accordion-summary-card info">
                            <div>
                              <span class="device-accordion-message-title">Validation has not been triggered for this rack.</span>
                              <span class="device-accordion-message-title">
                        Please select the devices and hit the Validate button above to run validation.
                      </span>
                            </div>
                          </div>
                      );
                    }
                  })()}

              <div class={`device-accordion-columns-header full-bleed device-table-columns-header ${props.isGpuRack ? "gpu" : ""}`}>
            <span class="device-col select">
              <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e: any) => toggleSelectAll((e.target as HTMLInputElement).checked)}
                  disabled={gpuRackSelectionDisabled || !props.rackValidationAllowed || eligibleDeviceKeys.size === 0}
                  title={
                    gpuRackSelectionDisabled
                        ? gpuRackSelectionDisabledReason
                        : !props.rackValidationAllowed
                        ? props.rackValidationTooltip
                        : eligibleDeviceKeys.size === 0
                        ? "No monitored and deployed devices are available for validation."
                        : ""
                  }
              />
            </span>
                <span>Device</span>
                <span>Elevation</span>
                <span>Errors</span>
                <span>PSU Status</span>
                <span className="device-last-validated-header">
                  <span>Last Validated</span>
                  <span className="device-tooltip-container">
                    <span
                      className="device-last-validated-tooltip-trigger"
                      aria-label={`Last validated legend: ${LAST_VALIDATED_LEGEND_ARIA_LABEL}`}
                      tabIndex={0}
                    >
                      ?
                    </span>
                    <span className="device-state-legend-tooltip device-last-validated-legend-tooltip" role="tooltip">
                      {LAST_VALIDATED_LEGEND_ITEMS.map((item) => (
                        <span className="device-state-legend-row" key={item.label}>
                          {item.className === "na" ? (
                            <span className="device-last-validated-na">{item.label}</span>
                          ) : (
                            <span className={`device-last-validated-pill legend ${item.className}`}>{item.label}</span>
                          )}
                          <span className="device-state-legend-description">{item.description}</span>
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
                {props.isGpuRack && (
                  <span className="device-last-validated-header">
                    <span>Host State</span>
                    <span className="device-tooltip-container">
                      <span
                        className="device-last-validated-tooltip-trigger"
                        aria-label={`Host State legend: ${HOST_STATE_LEGEND_ARIA_LABEL}`}
                        tabIndex={0}
                      >
                        ?
                      </span>
                      <span className="device-state-legend-tooltip" role="tooltip">
                        {HOST_STATE_LEGEND_ITEMS.map((item) => (
                          <span className="device-state-legend-row" key={item.state}>
                            <span className={`device-accordion-status ${item.className}`}>
                              {item.state}
                            </span>
                            <span className="device-state-legend-description">{item.description}</span>
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                )}
                <span>Status</span>
              </div>
              <oj-accordion id="deviceAccordion" key={accordionNonce} multiple={true}>
                {sortedDevices.map((device, idx) => {
                  const deviceFailures =
                      filteredFailuresByDevice[device.deviceName] || buildDeviceFailuresFallback(device.deviceName);
                  const isGpuCompute = isGpuComputeDevice(device.deviceName, props.isGpuRack);
                  const hasDeviceInformation = Boolean(isGpuCompute && device.hostReadinessStatus && device.hostSerial);
                  const hasDeviceFailures = deviceFailures.counts.nonPowerTotal > 0;
                  const hasExpandableContent = hasDeviceFailures || hasDeviceInformation;
                  const psuStatus = isGpuCompute
                      ? "-"
                      : getPsuStatusLabel(device.jobStatus, deviceFailures.hasPsuFailure);
                  const isExpanded = expandedKeys.has(device._key);
                  const isValidationEligible = props.eligibleDeviceNames.has(device.deviceName);
                  const statusToRender = isValidationEligible ? device.jobStatus : "NOT_ELIGIBLE";
                  const rowSelectionDisabled = gpuRackSelectionDisabled || !props.rackValidationAllowed || !isValidationEligible;
                  const disabledReason =
                      gpuRackSelectionDisabled
                          ? gpuRackSelectionDisabledReason
                          : !props.rackValidationAllowed
                          ? props.rackValidationTooltip
                          : (device.validationEligibilityReason ||
                              "Validation is available only for monitored and deployed devices.");

                  return (
                      <oj-collapsible
                          id={`deviceCollapsible-${idx}`}
                          key={device._key}
                          expanded={isExpanded}
                          onoj-before-expand={() => handleToggle(device._key, true, hasExpandableContent)}
                          onoj-before-collapse={() => handleToggle(device._key, false, hasExpandableContent)}
                          disabled={!hasExpandableContent}
                      >
                        <h3 slot="header" style={{ padding: 0, margin: 0, width: "100%" }}>
                          <div className={`device-accordion-header-row ${props.isGpuRack ? "gpu" : ""}`}>
                            {/* Selection checkbox */}
                            <span
                                className="device-col select"
                                onClick={(e) => e.stopPropagation()}
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                            >
                        {selectTemplate(
                            { item: { data: { _key: device._key } } },
                            rowSelectionDisabled,
                            disabledReason
                        )}
                      </span>

                            {/* Device name */}
                            <span className="device-col name">
                        <span className="device-accordion-devicename" title={device.deviceName}>
                          {device.deviceName}
                        </span>
                      </span>

                            {/* Elevation */}
                            <span className="device-col elevation" title="Elevation">
                        {typeof device.elevation === "number" ? device.elevation : "-"}
                      </span>

                            <span className="device-col errors">{renderErrorCount(device, deviceFailures)}</span>

                            {/* PSU status */}
                            <span className="device-col psu-status">
                        {psuStatus === "-" ? (
                            <span className="device-accordion-unknown">-</span>
                        ) : (
                            <span className="device-accordion-psu-chip">
                            {psuStatusTemplate(psuStatus === "DOWN")}
                              <span className="device-accordion-psu-label">{psuStatus}</span>
                          </span>
                        )}
                      </span>

                            <span className="device-col last-validated">{renderLastValidated(device, deviceFailures)}</span>

                            {props.isGpuRack && (
                              <span className="device-col validation-state">
                                {renderValidationState(device, isGpuCompute)}
                              </span>
                            )}

                            {/* Status */}
                            <span className="device-col status">
                        <span className={`device-accordion-status ${getStatusClass(statusToRender)}`}>
                          {formatStatusLabel(statusToRender)}
                        </span>
                      </span>
                          </div>
                        </h3>

                        {/* Collapsible content */}
                        {hasExpandableContent ? (
                            <div style={{ padding: "8px 24px", background: "#fff" }}>
                              <oj-accordion id={`testAccordion-${idx}`} multiple={true}>
                                {isGpuCompute && renderDeviceInformationSection(device, idx, ACC, props.region)}
                                {(isGpuCompute
                                    ? TEST_SECTIONS.filter((section) => section.id !== "fans")
                                    : TEST_SECTIONS
                                ).map((section) => {
                                  const sectionRows = addPatchPanelToSectionRows(
                                    section.id,
                                    getRowsForSection(deviceFailures, section.id),
                                    patchPanelByDevicePort
                                  );
                                  if (!sectionRows.length) return null;
                                  const sectionColumns = getSectionColumns(section, sectionRows, isGpuCompute);
                                  const sectionDataProvider = new ArrayDataProvider(sectionRows, {
                                    keyAttributes: "_key",
                                  });

                                  return (
                                      <oj-collapsible
                                          id={`device-${idx}-${section.id}`}
                                          key={`${device.deviceName}-${section.id}`}
                                          expanded={false}
                                      >
                                        <h4 slot="header" className="test-section-header">
                                          <span>{section.title}</span>
                                          <span className="test-section-count">{sectionRows.length}</span>
                                        </h4>
                                        <div className="oj-flex">
                                          <div className="oj-flex-item rack-panel table-wrapper-full">
                                            <oj-table
                                                class="selectable-table table-full"
                                                display="grid"
                                                horizontal-grid-visible="enabled"
                                                layout="contents"
                                                vertical-grid-visible="enabled"
                                                aria-label={`${section.title} Action Items`}
                                                id={`ValidationFailureItemsTable-${idx}-${section.id}`}
                                                accessibility={ACC}
                                                scroll-policy="loadMoreOnScroll"
                                                scroll-policy-options='{"fetchSize": 10}'
                                                columns={sectionColumns}
                                                data={sectionDataProvider}
                                            >
                                              <template slot="lldpStatusTemplate" render={lldpStatusTemplate} />
                                              <template slot="booleanStatusTemplate" render={booleanStatusTemplate} />
                                              <template slot="patchPanelMatrixTemplate" render={patchPanelMatrixTemplate} />
                                              <template slot="txPowerTemplate" render={txPowerTemplate} />
                                              <template slot="rxPowerTemplate" render={rxPowerTemplate} />
                                              <template slot="deviceALocationTemplate" render={deviceALocationTemplate} />
                                              <template slot="currentBLocationTemplate" render={currentBLocationTemplate} />
                                              <template slot="expectedBLocationTemplate" render={expectedBLocationTemplate} />
                                              <template slot="sourceDeviceLocationTemplate" render={sourceDeviceLocationTemplate} />
                                              <template slot="gpuLldpErrorDetailsTemplate" render={gpuLldpErrorDetailsTemplate} />
                                              <template slot="gpuMultilineErrorMessageTemplate" render={gpuMultilineErrorMessageTemplate} />
                                              <template slot="errorMessageClampTemplate" render={errorMessageClampTemplate} />
                                            </oj-table>
                                          </div>
                                        </div>
                                      </oj-collapsible>
                                  );
                                })}
                              </oj-accordion>
                            </div>
                        ) : null}
                      </oj-collapsible>
                  );
                })}
              </oj-accordion>
            </div>
        ) : (
            <div class="device-accordion-empty-state">
              <span class="device-accordion-empty-icon">ⓘ</span>
              <span class="device-accordion-empty-title">No devices found in this rack</span>
            </div>
        )}
      </div>
  );
};
export default DeviceAccordion;
