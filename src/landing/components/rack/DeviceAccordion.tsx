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
  gpuMultilineErrorMessageTemplate,
  lldpStatusTemplate,
  patchPanelMatrixTemplate,
  psuStatusTemplate,
  sourceDeviceLocationTemplate,
} from "./templates";
import { formatStatusLabel, getStatusClass, isDeviceStatusCompleted, isGpuComputeDevice } from "./utils";
type ValidationAgeColor = "green" | "orange" | "red";

const VALIDATION_AGE_THRESHOLDS_MS = {
  // when currentTime - lastValidated <= GREEN_MAX then display green color
  // else when currentTime - lastValidated >= RED_MIN then display red color
  // else display orange color
  GREEN_MAX: 2 * 60 * 1000,
  RED_MIN: 10 * 60 * 1000,
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
  if (elapsedSinceValidationMs >= VALIDATION_AGE_THRESHOLDS_MS.RED_MIN) return "red";
  return "orange";
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
  if (elapsedSinceValidationMs < VALIDATION_AGE_THRESHOLDS_MS.RED_MIN) {
    return lastValidatedTimestampMs + VALIDATION_AGE_THRESHOLDS_MS.RED_MIN + 50;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expandGroupedPortVariants(devicePort: string | undefined | null): string[] {
  const normalizedPort = String(devicePort || "").trim();
  if (!normalizedPort) return [];

  const groupedPortMatch = normalizedPort.match(/^(.*\[)([^\]]+)(\].*)$/);
  if (!groupedPortMatch) {
    return [normalizedPort];
  }

  const [, prefix, groupedSegment, suffix] = groupedPortMatch;
  const expandedMembers = groupedSegment
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  if (expandedMembers.length === 0) {
    return [normalizedPort];
  }

  const prefixWithoutBracket = prefix.slice(0, -1);
  const suffixWithoutBracket = suffix.startsWith("]") ? suffix.slice(1) : suffix;
  const separatorMatch = prefixWithoutBracket.match(/([\/-])$/);
  const separator = separatorMatch ? separatorMatch[1] : "";
  const basePrefix = separator ? prefixWithoutBracket.slice(0, -1) : prefixWithoutBracket;
  const trailingNumberMatch = basePrefix.match(/^(.*?)(\d+)$/);

  const variants = new Set<string>([normalizedPort]);
  expandedMembers.forEach((member) => {
    const expandedPort = trailingNumberMatch
      ? `${trailingNumberMatch[1]}${member}${separator}${member}${suffixWithoutBracket}`
      : `${basePrefix}${member}${suffixWithoutBracket}`;
    variants.add(expandedPort);
  });

  return Array.from(variants);
}

function buildPatchPanelLookupKeys(
  deviceName: string | undefined | null,
  devicePort: string | undefined | null,
  easyMark: unknown
): string[] {
  const normalizedDeviceName = String(deviceName || "").trim();
  if (!normalizedDeviceName) return [];

  const lookupKeys = new Set<string>();
  expandGroupedPortVariants(devicePort).forEach((portVariant) => {
    lookupKeys.add(toDevicePortKey(normalizedDeviceName, portVariant));
  });

  const easyMarkLines = Array.isArray(easyMark)
    ? easyMark.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  if (easyMarkLines.length > 0) {
    expandGroupedPortVariants(devicePort).forEach((portVariant) => {
      const normalizedPortVariant = String(portVariant || "").trim();
      if (!normalizedPortVariant) return;

      const escapedPortVariant = escapeRegExp(normalizedPortVariant);
      const groupedVariantPatterns = expandGroupedPortVariants(devicePort)
        .map((candidate) => String(candidate || "").trim())
        .filter(Boolean)
        .map((candidate) => new RegExp(`(^|\\s)${escapeRegExp(candidate)}(?=\\s|$)`));

      easyMarkLines.forEach((line) => {
        const normalizedLine = line.replace(/•/g, "").trim();
        if (!normalizedLine) return;

        groupedVariantPatterns.forEach((pattern) => {
          if (!pattern.test(normalizedLine)) return;

          const replacedLine = normalizedLine.replace(pattern, (match, prefix) => `${prefix}${normalizedPortVariant}`);
          lookupKeys.add(toDevicePortKey(normalizedDeviceName, normalizedPortVariant));

          const normalizedDevicePrefix = normalizedDeviceName.toLowerCase();
          const normalizedReplacedLine = replacedLine.toLowerCase();
          if (normalizedReplacedLine.startsWith(`${normalizedDevicePrefix} `)) {
            const candidatePort = replacedLine.slice(normalizedDeviceName.length).trim().split(/\s+/)[0];
            if (candidatePort) {
              lookupKeys.add(toDevicePortKey(normalizedDeviceName, candidatePort));
            }
          }
        });
      });
    });
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
    return hasErrorMessage
      ? [...GPU_COMPUTE_OPTIC_FAILURE_COLUMNS]
      : GPU_COMPUTE_OPTIC_FAILURE_COLUMNS.filter((column) => column.id !== "errorMessage");
  }

  if (isGpuCompute && section.id === "interfaces") {
    return [...GPU_COMPUTE_INTERFACE_FAILURE_COLUMNS];
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

  const groupedPortMatch = normalizedPort.match(/^(.*\[)([^\]]+)(\].*)$/);
  if (groupedPortMatch) {
    const [, prefix, groupedSegment, suffix] = groupedPortMatch;
    const members = groupedSegment
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => Number(part))
      .filter((part) => Number.isFinite(part))
      .sort((a, b) => a - b);

    if (members.length > 0) {
      return `${prefix}${members.join("+")}${suffix}`.toLowerCase();
    }
  }

  const singlePortMatch = normalizedPort.match(/^(.*?)(\d+)$/);
  if (!singlePortMatch) {
    return normalizedPort.toLowerCase();
  }

  const [, prefix, trailingNumberText] = singlePortMatch;
  const trailingNumber = Number(trailingNumberText);
  if (!Number.isFinite(trailingNumber)) {
    return normalizedPort.toLowerCase();
  }

  const pairStart = trailingNumber % 2 === 0 ? trailingNumber - 1 : trailingNumber;
  if (pairStart <= 0) {
    return normalizedPort.toLowerCase();
  }

  return `${prefix}[${pairStart}+${pairStart + 1}]`.toLowerCase();
}

function propagatePatchPanelFromSiblingRows(sectionId: TestSectionConfig["id"], rows: any[]): any[] {
  if (sectionId === "fans") return rows;

  const patchPanelByFamily = new Map<string, string>();
  const patchPanelByAnyFamily = new Map<string, string>();

  rows.forEach((row) => {
    if (isMissingPatchPanelValue(row.patchPanelMatrix)) return;

    const { deviceName, devicePort } = getRowDeviceAndPort(sectionId, row);
    const normalizedFamily = toLogicalPortFamily(devicePort);
    const normalizedDeviceName = normalizeDeviceName(deviceName);
    const familyKey = `${normalizedDeviceName}|${normalizedFamily}`;
    if (normalizedDeviceName && normalizedFamily) {
      patchPanelByFamily.set(familyKey, String(row.patchPanelMatrix));
      if (!patchPanelByAnyFamily.has(normalizedFamily)) {
        patchPanelByAnyFamily.set(normalizedFamily, String(row.patchPanelMatrix));
      }
    }
  });

  return rows.map((row) => {
    if (!isMissingPatchPanelValue(row.patchPanelMatrix)) {
      return row;
    }

    const { deviceName, devicePort } = getRowDeviceAndPort(sectionId, row);
    const normalizedFamily = toLogicalPortFamily(devicePort);
    const familyKey = `${normalizeDeviceName(deviceName)}|${normalizedFamily}`;
    const siblingPatchPanelValue = patchPanelByFamily.get(familyKey) || patchPanelByAnyFamily.get(normalizedFamily);

    if (!siblingPatchPanelValue) {
      return row;
    }

    return {
      ...row,
      patchPanelMatrix: siblingPatchPanelValue,
    };
  });
}

function addPatchPanelToSectionRows(
  sectionId: TestSectionConfig["id"],
  rows: any[],
  patchPanelByDevicePort: PatchPanelLookupMap
): any[] {
  if (sectionId === "fans") return rows;

  const rowsWithPatchPanel = rows.map((row) => {
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

  return propagatePatchPanelFromSiblingRows(sectionId, rowsWithPatchPanel);
}

function getPsuStatusLabel(jobStatus: string, hasPsuFailure: boolean): "UP" | "DOWN" | "-" {
  const normalized = (jobStatus || "").toUpperCase();
  if (normalized !== "COMPLETED" && normalized !== "DEVICE_UNREACHABLE") {
    return "-";
  }
  return hasPsuFailure ? "DOWN" : "UP";
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
     const keys = buildPatchPanelLookupKeys(panelRow.deviceName, panelRow.devicePort, panelRow.easyMark);
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
    return (
        <span
            className={`device-last-validated-dot ${validationColor}`}
            title={`Last validated indicator: ${validationColor}`}
            aria-label={`Last validated status ${validationColor}`}
        />
    );
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

              <div class="device-last-validated-legend full-bleed">
                <span className="device-accordion-legend-title">Last Validated Legend</span>
                <span className="device-accordion-legend-item">
                  <span className="device-last-validated-dot green legend" />
                  Within last 2 minutes
                </span>
                <span className="device-accordion-legend-item">
                  <span className="device-last-validated-dot orange legend" />
                  Between 2 to 10 min ago
                </span>
                <span className="device-accordion-legend-item">
                  <span className="device-last-validated-dot red legend" />
                  Over 10 minutes ago
                </span>
                <span className="device-accordion-legend-item">
                  <span className="device-last-validated-na">N/A</span>
                  Not eligible for validation
                </span>
              </div>

              <div class="device-accordion-columns-header full-bleed device-table-columns-header">
            <span class="device-col select">
              <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e: any) => toggleSelectAll((e.target as HTMLInputElement).checked)}
                  disabled={!props.rackValidationAllowed || eligibleDeviceKeys.size === 0}
                  title={
                    !props.rackValidationAllowed
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
                <span>Last Validated</span>
                <span>Status</span>
              </div>
              <oj-accordion id="deviceAccordion" key={accordionNonce} multiple={true}>
                {sortedDevices.map((device, idx) => {
                  const deviceFailures =
                      filteredFailuresByDevice[device.deviceName] || buildDeviceFailuresFallback(device.deviceName);
                  const isGpuCompute = isGpuComputeDevice(device.deviceName, props.isGpuRack);
                  const hasDeviceFailures = deviceFailures.counts.nonPowerTotal > 0;
                  const psuStatus = isGpuCompute
                      ? "-"
                      : getPsuStatusLabel(device.jobStatus, deviceFailures.hasPsuFailure);
                  const isExpanded = expandedKeys.has(device._key);
                  const isValidationEligible = props.eligibleDeviceNames.has(device.deviceName);
                  const statusToRender = isValidationEligible ? device.jobStatus : "NOT_ELIGIBLE";
                  const rowSelectionDisabled = !props.rackValidationAllowed || !isValidationEligible;
                  const disabledReason =
                      !props.rackValidationAllowed
                          ? props.rackValidationTooltip
                          : (device.validationEligibilityReason ||
                              "Validation is available only for monitored and deployed devices.");

                  return (
                      <oj-collapsible
                          id={`deviceCollapsible-${idx}`}
                          key={device._key}
                          expanded={isExpanded}
                          onoj-before-expand={() => handleToggle(device._key, true, hasDeviceFailures)}
                          onoj-before-collapse={() => handleToggle(device._key, false, hasDeviceFailures)}
                          disabled={!hasDeviceFailures}
                      >
                        <h3 slot="header" style={{ padding: 0, margin: 0, width: "100%" }}>
                          <div className="device-accordion-header-row">
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

                            {/* Status */}
                            <span className="device-col status">
                        <span className={`device-accordion-status ${getStatusClass(statusToRender)}`}>
                          {formatStatusLabel(statusToRender)}
                        </span>
                      </span>
                          </div>
                        </h3>

                        {/* Collapsible content */}
                        {hasDeviceFailures ? (
                            <div style={{ padding: "8px 24px", background: "#fff" }}>
                              <oj-accordion id={`testAccordion-${idx}`} multiple={true}>
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
                                              <template slot="deviceALocationTemplate" render={deviceALocationTemplate} />
                                              <template slot="currentBLocationTemplate" render={currentBLocationTemplate} />
                                              <template slot="expectedBLocationTemplate" render={expectedBLocationTemplate} />
                                              <template slot="sourceDeviceLocationTemplate" render={sourceDeviceLocationTemplate} />
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
