import { h } from "preact";
import { memo } from "preact/compat";
import { useMemo, useState, useEffect, useRef, useCallback, useLayoutEffect } from "preact/hooks";
import "ojs/ojaccordion";
import "ojs/ojcollapsible";
import "ojs/ojtable";
import "oj-c/button";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

import {
  DeviceStatus,
  DeviceValidationFailures,
  PatchPanelByDevicePort,
  PatchPanelRow,
  RackValidationViewMode,
  ValidationSection,
  ValidationFailuresByDevice,
  ValidationTableRow,
} from "./types";
import {
  FEC_BER_FAILURE_COLUMNS,
  GPU_COMPUTE_LLDP_FAILURE_COLUMNS,
  GPU_COMPUTE_OPTIC_FAILURE_COLUMNS,
  PATCH_PANEL_COLUMN_SETTINGS,
  RAW_BER_COLUMN_SETTINGS,
  RX_POWER_COLUMN_SETTINGS,
} from "./columns";
import {
  VALIDATION_TABLE_ACCESSIBILITY,
} from "./constants";
import {
  NOT_READY_FOR_LVV_LABEL,
  NOT_READY_FOR_LVV_TOOLTIP,
  READINESS_STATES_WITH_REAL_ERRORS,
  shouldDisplayHostTransceiverMetrics,
} from "./readinessDisplayConfig";
import { orderValidationSectionKeys, VALIDATION_COLUMN_ORDER_BY_SECTION } from "./columnOrder";
import {
  booleanStatusTemplate,
  currentBLocationTemplate,
  errorMessageClampTemplate,
  expectedBLocationTemplate,
  gpuLldpErrorDetailsTemplate,
  gpuMultilineErrorMessageTemplate,
  lldpStatusTemplate,
  opticalRawBerTemplate,
  plainRawBerTemplate,
  patchPanelMatrixTemplate,
  psuStatusTemplate,
  relativeTimestampTemplate,
  txPowerTemplate,
  rxPowerTemplate,
  laneValuesTemplate,
  sourceDeviceLocationTemplate,
} from "./templates";
import {
  formatStatusLabel,
  formatValidationTimestamp,
  getStatusClass,
  isDeviceStatusCompleted,
  isGpuComputeDevice
} from "./utils";
type ValidationAgeColor = "green" | "orange" | "red";

const VALIDATION_AGE_THRESHOLDS_MS = {
  GREEN_MAX: 2 * 60 * 1000,
  RED_MIN: 10 * 60 * 1000,
} as const;
const VALIDATION_TIMESTAMP_REFRESH_INTERVAL_MS = 5 * 1000;

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

function syncExpandedCollapsibleLayout(root: HTMLDivElement | null, expandedKeys: Set<string>): void {
  if (!root) {
    return;
  }

  const collapsibles = Array.from(
    root.querySelectorAll<HTMLElement>("oj-collapsible[data-device-key]")
  );

  collapsibles.forEach((collapsible) => {
    const deviceKey = collapsible.getAttribute("data-device-key") || "";
    const wrapper = Array.from(collapsible.children).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.classList.contains("oj-collapsible-wrapper")
    );
    const content = wrapper
      ? Array.from(wrapper.children).find(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child.classList.contains("oj-collapsible-content")
        )
      : null;

    if (!wrapper) {
      return;
    }

    if (expandedKeys.has(deviceKey)) {
      // Keep expanded rows fully visible when nested validation content grows after open.
      wrapper.style.maxHeight = "none";
      wrapper.style.overflow = "visible";
      if (content) {
        content.style.overflow = "visible";
      }
      return;
    }

    wrapper.style.removeProperty("max-height");
    wrapper.style.removeProperty("overflow");
    if (content) {
      content.style.removeProperty("overflow");
    }
  });
}

function isDeviceNotEligibleForValidation(
    device: DeviceStatus,
    _deviceFailures: DeviceValidationFailures
): boolean {
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
  periodicValidationDeviceNames: Set<string>;
  isPeriodicValidationRefreshing: boolean;
  onRefreshPeriodicValidation: (
      deviceNames?: Iterable<string>
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  validationFailuresByDevice: ValidationFailuresByDevice;
  deviceRefreshTimestampsByName: Record<string, string | null>;
  patchPanelByDevicePort: PatchPanelByDevicePort;
  totalFailureRows: number;
  totalLinkFailureRows: number;
  powerFailureDevices: number;
  selectedLinkKeys: Set<string>;
  setSelectedLinkKeys: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  loading: boolean;
  isValidating: boolean;
  hideUnsupported: boolean;
  hideNotReadyDeviceErrors?: boolean;
  rackValidationAllowed: boolean;
  rackValidationTooltip: string;
  periodicValidationEnabled: boolean;
  viewMode?: RackValidationViewMode;
  showSelection?: boolean;
  externalExpandedKeys?: Set<string>;
  externalExpandedKeysNonce?: number;
};

type ValidationSectionTableProps = {
  deviceIndex: number;
  deviceName: string;
  isGpuRack?: boolean;
  hideLastExecuted?: boolean;
  section: ValidationSection;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

type ValidationSectionGroup = {
  key: string;
  title: string;
  sections: ValidationSection[];
};

type HostTransceiverSummaryCounts = {
  pass: number;
  fail: number;
  stale: number;
  total: number;
};

type StableHostTransceiverTimestamp = {
  timestamp: string;
  timestampMs: number;
};

function areStringArraysEqual(left: string[] | undefined, right: string[] | undefined): boolean {
  const leftValues = left || [];
  const rightValues = right || [];
  if (leftValues.length !== rightValues.length) {
    return false;
  }

  return leftValues.every((value, index) => value === rightValues[index]);
}

function areUnknownValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => areUnknownValuesEqual(value, right[index]));
  }

  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();

    if (!areStringArraysEqual(leftKeys, rightKeys)) {
      return false;
    }

    return leftKeys.every((key) => areUnknownValuesEqual(leftRecord[key], rightRecord[key]));
  }

  return false;
}

function areValidationTableRowsEqual(
  leftRows: ValidationTableRow[],
  rightRows: ValidationTableRow[]
): boolean {
  if (leftRows.length !== rightRows.length) {
    return false;
  }

  return leftRows.every((row, index) => areUnknownValuesEqual(row, rightRows[index]));
}

function ValidationSectionRowsTable(
  props: Pick<ValidationSectionTableProps, "deviceIndex" | "section" | "isGpuRack" | "hideLastExecuted">
) {
  const { deviceIndex, section, isGpuRack, hideLastExecuted } = props;
  const stableRowsRef = useRef<ValidationTableRow[]>(section.rows);

  if (!areValidationTableRowsEqual(stableRowsRef.current, section.rows)) {
    stableRowsRef.current = section.rows;
  }

  const stableRows = stableRowsRef.current;
  const sectionColumns = useMemo(
    () => getSectionColumns(section.title, stableRows, isGpuRack, hideLastExecuted),
    [section.title, stableRows, isGpuRack, hideLastExecuted]
  );
  const sectionDataProvider = useMemo(
    () => new ArrayDataProvider(stableRows, { keyAttributes: "_key" }),
    [stableRows]
  );
  const tableContainerHeight = useMemo(
    () => getValidationTableContainerHeight(section.title, stableRows, isGpuRack),
    [section.title, stableRows, isGpuRack]
  );

  return (
    <div
      className="validation-section-table-container"
      style={{ height: `${tableContainerHeight}px` }}
    >
      <oj-table
        class="selectable-table table-full"
        display="grid"
        horizontal-grid-visible="enabled"
        layout="contents"
        vertical-grid-visible="enabled"
        aria-label={`${section.title} Action Items`}
        id={`ValidationFailureItemsTable-${deviceIndex}-${section.key}`}
        accessibility={VALIDATION_TABLE_ACCESSIBILITY}
        scroll-policy="loadAll"
        columns={sectionColumns}
        data={sectionDataProvider}
      >
        <template slot="lldpStatusTemplate" render={lldpStatusTemplate} />
        <template slot="booleanStatusTemplate" render={booleanStatusTemplate} />
        <template slot="patchPanelMatrixTemplate" render={patchPanelMatrixTemplate} />
        <template slot="txPowerTemplate" render={txPowerTemplate} />
        <template slot="rxPowerTemplate" render={rxPowerTemplate} />
        <template slot="relativeTimestampTemplate" render={relativeTimestampTemplate} />
        <template slot="sourceDeviceLocationTemplate" render={sourceDeviceLocationTemplate} />
        <template slot="currentBLocationTemplate" render={currentBLocationTemplate} />
        <template slot="expectedBLocationTemplate" render={expectedBLocationTemplate} />
        <template slot="gpuLldpErrorDetailsTemplate" render={gpuLldpErrorDetailsTemplate} />
        <template slot="gpuMultilineErrorMessageTemplate" render={gpuMultilineErrorMessageTemplate} />
        <template slot="opticalRawBerTemplate" render={opticalRawBerTemplate} />
        <template slot="plainRawBerTemplate" render={plainRawBerTemplate} />
        <template slot="laneValuesTemplate" render={laneValuesTemplate} />
        <template slot="errorMessageClampTemplate" render={errorMessageClampTemplate} />
      </oj-table>
    </div>
  );
}

const MemoizedValidationSectionRowsTable = memo(
  ValidationSectionRowsTable,
  (previousProps, nextProps) =>
    previousProps.deviceIndex === nextProps.deviceIndex &&
    previousProps.isGpuRack === nextProps.isGpuRack &&
    previousProps.hideLastExecuted === nextProps.hideLastExecuted &&
    previousProps.section.title === nextProps.section.title &&
    previousProps.section.key === nextProps.section.key &&
    areValidationTableRowsEqual(previousProps.section.rows, nextProps.section.rows)
);

function ValidationSectionTable(props: ValidationSectionTableProps) {
  const { deviceIndex, deviceName, isGpuRack, hideLastExecuted, section, expanded = false, onExpandedChange } = props;
  const shouldRenderContent = expanded || !onExpandedChange;

  return (
    <oj-collapsible
      id={`device-${deviceIndex}-${section.key}`}
      key={`${deviceName}-${section.key}`}
      class="oj-accordion-collapsible"
      expanded={expanded}
      onojBeforeExpand={(event: Event) => {
        event.stopPropagation();
        onExpandedChange?.(true);
      }}
      onojBeforeCollapse={(event: Event) => {
        event.stopPropagation();
        onExpandedChange?.(false);
      }}
    >
      <div slot="header" className="test-section-header" role="heading" aria-level={4}>
        <span>{section.title}</span>
        <span className="test-section-count">{section.rows.length}</span>
      </div>
      {shouldRenderContent && (
        <div className="oj-flex">
          <div className="oj-flex-item rack-panel table-wrapper-full">
            <MemoizedValidationSectionRowsTable
              deviceIndex={deviceIndex}
              isGpuRack={isGpuRack}
              hideLastExecuted={hideLastExecuted}
              section={section}
            />
          </div>
        </div>
      )}
    </oj-collapsible>
  );
}

const MemoizedValidationSectionTable = memo(
  ValidationSectionTable,
  (previousProps, nextProps) =>
    previousProps.deviceIndex === nextProps.deviceIndex &&
    previousProps.deviceName === nextProps.deviceName &&
    previousProps.isGpuRack === nextProps.isGpuRack &&
    previousProps.hideLastExecuted === nextProps.hideLastExecuted &&
    previousProps.section.title === nextProps.section.title &&
    previousProps.section.key === nextProps.section.key &&
    previousProps.expanded === nextProps.expanded &&
    areValidationTableRowsEqual(previousProps.section.rows, nextProps.section.rows)
);

function normalizeDeviceName(value: string | undefined | null): string {
  return String(value || "").trim().toLowerCase();
}

function isUsableLookupValue(value: string | undefined | null): boolean {
  const normalized = normalizeDeviceName(value);
  return !["", "unknown", "n/a", "na", "-", "null"].includes(normalized);
}

function getLookupValue(
  primary: unknown,
  fallback?: unknown
): string {
  if (isUsableLookupValue(primary == null ? "" : String(primary))) {
    return String(primary ?? "").trim();
  }

  if (isUsableLookupValue(fallback == null ? "" : String(fallback))) {
    return String(fallback ?? "").trim();
  }

  return "";
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

function normalizeSectionTitle(value: string | undefined | null): string {
  return String(value || "").trim().toLowerCase();
}

const HOST_TRANSCEIVER_OPTICS_TITLE = "Optics";
const HOST_TRANSCEIVER_FEC_BER_TITLE = "FEC-BER";
const T0_TO_HOST_GROUP_KEY = "t0-to-host";
const HOST_TRANSCEIVER_GROUP_KEY = "host-transceiver";
const T0_TO_HOST_SECTION_ORDER = [
  "interface errors",
  "lldp errors",
  "optic errors",
  "fec_ber errors",
  "raw ber errors",
];

function isHostTransceiverSection(sectionTitle: string): boolean {
  return normalizeSectionTitle(sectionTitle) === "gpu host transceiver";
}

function isHostTransceiverOpticsSection(sectionTitle: string): boolean {
  return normalizeSectionTitle(sectionTitle) === normalizeSectionTitle(HOST_TRANSCEIVER_OPTICS_TITLE);
}

function isHostTransceiverFecBerSection(sectionTitle: string): boolean {
  return normalizeSectionTitle(sectionTitle) === normalizeSectionTitle(HOST_TRANSCEIVER_FEC_BER_TITLE);
}

function isHostTransceiverDisplaySection(sectionTitle: string): boolean {
  return isHostTransceiverSection(sectionTitle) ||
    isHostTransceiverOpticsSection(sectionTitle) ||
    isHostTransceiverFecBerSection(sectionTitle);
}

function getValidationTableContainerHeight(
  sectionTitle: string,
  sectionRows: ValidationTableRow[],
  isGpuRack?: boolean
): number {
  const headerHeightPx = 58;
  const maxExpandedTableHeightPx = 720;
  const hostTransceiverRowHeightPx = 52;
  const rowCount = sectionRows.length;
  if (rowCount === 0) {
    return headerHeightPx;
  }

  const isGpuRackSection = Boolean(isGpuRack);
  if (
    isGpuRackSection &&
    (isInterfaceSection(sectionTitle) ||
      isGpuLldpSection(sectionTitle, sectionRows) ||
      isGpuOpticSection(sectionTitle, sectionRows))
  ) {
    return Math.min(maxExpandedTableHeightPx, headerHeightPx + rowCount * 190);
  }

  if (isGpuRackSection && isGpuFecBerSection(sectionTitle, sectionRows)) {
    return Math.min(maxExpandedTableHeightPx, headerHeightPx + rowCount * 120);
  }

  if (isHostTransceiverDisplaySection(sectionTitle)) {
    return Math.min(maxExpandedTableHeightPx, headerHeightPx + rowCount * hostTransceiverRowHeightPx);
  }

  return Math.min(maxExpandedTableHeightPx, headerHeightPx + rowCount * 96);
}

function getRowTextValue(row: ValidationTableRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function getHostTransceiverTimestampKey(
  deviceName: string,
  sectionTitle: string,
  row: ValidationTableRow,
  rowIndex: number
): string {
  const hostName = getRowTextValue(row, ["Host Name", "Host Serial", "Host Serial Number"]);
  const hostPort = getRowTextValue(row, ["Port Name", "Host Port", "Interface Name"]);
  const metricType = isHostTransceiverOpticsSection(sectionTitle) ? "optics" : "fec-ber";
  const rowIdentity = hostName || hostPort
    ? `${hostName}|${hostPort}`
    : String(row._key ?? rowIndex);
  return [deviceName, metricType, rowIdentity].join("|");
}

function applyStableHostTransceiverTimestamps(
  deviceName: string,
  groups: ValidationSectionGroup[],
  timestampCache: Map<string, StableHostTransceiverTimestamp>,
  referenceTimeMs: number
): ValidationSectionGroup[] {
  return groups.map((group) => {
    if (group.key !== HOST_TRANSCEIVER_GROUP_KEY) {
      return group;
    }

    return {
      ...group,
      sections: group.sections.map((section) => ({
        ...section,
        rows: section.rows.map((row, rowIndex) => {
          const rawLastUpdated = getRowTextValue(row, ["Last Updated"]);
          const parsedTimestampMs = Date.parse(rawLastUpdated);
          const cacheKey = getHostTransceiverTimestampKey(deviceName, section.title, row, rowIndex);
          const cachedTimestamp = timestampCache.get(cacheKey);
          const shouldUseBackendTimestamp =
            Number.isFinite(parsedTimestampMs) &&
            (!cachedTimestamp || parsedTimestampMs > cachedTimestamp.timestampMs);

          const stableTimestamp = shouldUseBackendTimestamp
            ? { timestamp: rawLastUpdated, timestampMs: parsedTimestampMs }
            : cachedTimestamp;

          if (shouldUseBackendTimestamp && stableTimestamp) {
            timestampCache.set(cacheKey, stableTimestamp);
          }

          const displayTimestamp = stableTimestamp?.timestamp || rawLastUpdated;
          return {
            ...row,
            __relativeTimestampRaw: displayTimestamp,
            __relativeTimestampDisplay: formatValidationTimestamp(displayTimestamp || null, referenceTimeMs),
          };
        }),
      })),
    };
  });
}

function rowHasAnyValue(row: ValidationTableRow, keys: string[]): boolean {
  return getRowTextValue(row, keys) !== "";
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

function buildHostTransceiverSection(
  parentSection: ValidationSection,
  title: string,
  keySuffix: string,
  rows: ValidationTableRow[]
): ValidationSection | null {
  if (rows.length === 0) {
    return null;
  }

  return {
    key: `${parentSection.key}-${keySuffix}`,
    title,
    rows,
  };
}

function splitHostTransceiverSections(section: ValidationSection): ValidationSection[] {
  const opticsRows = section.rows.filter((row) =>
    isHostTransceiverActionableMetric(row, ["RX Power (dBm)"], ["RX Status"])
  );
  const fecBerRows = section.rows.filter((row) =>
    isHostTransceiverActionableMetric(row, ["Raw BER"], ["Raw BER Status"])
  );

  return [
    buildHostTransceiverSection(section, HOST_TRANSCEIVER_OPTICS_TITLE, "optics", opticsRows),
    buildHostTransceiverSection(section, HOST_TRANSCEIVER_FEC_BER_TITLE, "fec-ber", fecBerRows),
  ].filter((childSection): childSection is ValidationSection => Boolean(childSection));
}

function orderT0ToHostSections(sections: ValidationSection[]): ValidationSection[] {
  return [...sections].sort((left, right) => {
    const leftRank = T0_TO_HOST_SECTION_ORDER.indexOf(normalizeSectionTitle(left.title));
    const rightRank = T0_TO_HOST_SECTION_ORDER.indexOf(normalizeSectionTitle(right.title));
    const normalizedLeftRank = leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank;
    const normalizedRightRank = rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank;

    if (normalizedLeftRank === normalizedRightRank) {
      return 0;
    }
    return normalizedLeftRank - normalizedRightRank;
  });
}

function buildValidationSectionGroups(
  visibleSections: ValidationSection[],
  showHostTransceiverMetrics: boolean = true
): ValidationSectionGroup[] {
  const hostTransceiverSections = showHostTransceiverMetrics
    ? visibleSections
      .filter((section) => isHostTransceiverSection(section.title))
      .flatMap(splitHostTransceiverSections)
    : [];
  const t0ToHostSections = orderT0ToHostSections(
    visibleSections.filter((section) => !isHostTransceiverSection(section.title))
  );
  const groups: ValidationSectionGroup[] = [];

  if (t0ToHostSections.length > 0) {
    groups.push({
      key: T0_TO_HOST_GROUP_KEY,
      title: "T0 to Host",
      sections: t0ToHostSections,
    });
  }

  if (hostTransceiverSections.length > 0) {
    groups.push({
      key: HOST_TRANSCEIVER_GROUP_KEY,
      title: "Host Transceiver",
      sections: hostTransceiverSections,
    });
  }

  return groups;
}

function getValidationSectionGroupRowCount(group: ValidationSectionGroup): number {
  return group.sections.reduce((totalRows, section) => totalRows + section.rows.length, 0);
}

type ErrorCountChip = {
  label: string;
  count: number;
  typeClass: string;
  title?: string;
  ariaLabel?: string;
};

function getHostTransceiverErrorChips(
  deviceFailures: DeviceValidationFailures,
  showHostTransceiverMetrics: boolean = true
): ErrorCountChip[] {
  if (!showHostTransceiverMetrics) {
    return [];
  }

  return deviceFailures.sectionOrder
    .flatMap((sectionKey) => {
      const section = deviceFailures.sections[sectionKey];
      if (!section || !isHostTransceiverSection(section.title)) {
        return [];
      }

      return splitHostTransceiverSections(section).map((childSection) => ({
        label: isHostTransceiverOpticsSection(childSection.title) ? "HOST_OPT" : "HOST_FEC_BER",
        count: childSection.rows.length,
        typeClass: isHostTransceiverOpticsSection(childSection.title) ? "chip-host-opt" : "chip-host-fec",
      }));
    })
    .filter((chip) => chip.count > 0);
}

function renderErrorChipRow(chips: ErrorCountChip[]) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <span className="device-accordion-error-chip-row">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className={`device-accordion-error-chip ${chip.typeClass}`}
          title={chip.title || `${chip.label}: ${chip.count}`}
          aria-label={chip.ariaLabel}
        >
          {chip.label}:{chip.count}
        </span>
      ))}
    </span>
  );
}

function normalizeHostTransceiverStatus(value: unknown): "pass" | "fail" | "stale" | "" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["pass", "passed", "success", "ok", "healthy"].includes(normalized)) {
    return "pass";
  }
  if (["fail", "failed", "failure", "error", "down", "critical"].includes(normalized)) {
    return "fail";
  }
  if (["stale", "missing", "unknown", "pending"].includes(normalized)) {
    return "stale";
  }
  return normalized === "" ? "" : "stale";
}

function getHostTransceiverRowSummaryStatus(row: ValidationTableRow): "pass" | "fail" | "stale" {
  const validationStatus = normalizeHostTransceiverStatus(row["Validation Status"]);
  if (validationStatus) {
    return validationStatus;
  }

  const metricStatuses = [
    normalizeHostTransceiverStatus(row["RX Status"]),
    normalizeHostTransceiverStatus(row["Raw BER Status"]),
  ].filter((status): status is "pass" | "fail" | "stale" => status !== "");

  if (metricStatuses.some((status) => status === "fail")) {
    return "fail";
  }
  if (metricStatuses.some((status) => status === "stale")) {
    return "stale";
  }
  return metricStatuses.length > 0 ? "pass" : "stale";
}

function summarizeHostTransceiverRows(
  failuresByDevice: ValidationFailuresByDevice,
  hostTransceiverMetricDeviceNames?: Iterable<string>
): HostTransceiverSummaryCounts {
  const counts: HostTransceiverSummaryCounts = { pass: 0, fail: 0, stale: 0, total: 0 };
  const displayNames = hostTransceiverMetricDeviceNames
    ? new Set(Array.from(hostTransceiverMetricDeviceNames).map((deviceName) => normalizeDeviceName(deviceName)))
    : null;

  Object.entries(failuresByDevice).forEach(([deviceName, deviceFailures]) => {
    if (displayNames && !displayNames.has(normalizeDeviceName(deviceName))) {
      return;
    }

    deviceFailures.sectionOrder.forEach((sectionKey) => {
      const section = deviceFailures.sections[sectionKey];
      if (!section || !isHostTransceiverSection(section.title)) {
        return;
      }

      section.rows.forEach((row) => {
        const status = getHostTransceiverRowSummaryStatus(row);
        if (status === "pass") {
          return;
        }
        counts[status] += 1;
        counts.total += 1;
      });
    });
  });

  return counts;
}

function countT0ToHostRows(deviceFailures: DeviceValidationFailures): number {
  return deviceFailures.sectionOrder.reduce((total, sectionKey) => {
    const section = deviceFailures.sections[sectionKey];
    if (!section || isHostTransceiverSection(section.title)) {
      return total;
    }
    return total + section.rows.length;
  }, 0);
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

function buildGpuFecBerColumns(sectionRows: ValidationTableRow[]): any[] {
  const shouldShowDeviceName = sectionRows.some((row) => hasRenderableValue(row.deviceName ?? row["Device Name"]));

  const columns: any[] = [];

  if (shouldShowDeviceName) {
    columns.push({ headerText: "Device Name", field: "Device Name", id: "Device Name", resizable: "enabled", sortable: "enabled" });
  }

  columns.push(
    { headerText: "Device Port", field: "Interface", id: "Interface", resizable: "enabled", sortable: "enabled" },
    {
      headerText: "Lane Values",
      field: "Lane Values",
      id: "Lane Values",
      template: "laneValuesTemplate",
      resizable: "enabled",
      sortable: "enabled",
    },
    { headerText: "Issue", field: "Issue", id: "Issue", resizable: "enabled", sortable: "enabled" }
  );

  return columns;
}

function buildHostTransceiverColumns(sectionTitle: string): any[] {
  const isOpticsSection = isHostTransceiverOpticsSection(sectionTitle);
  const metricField = isOpticsSection ? "RX Power (dBm)" : "Raw BER";
  const metricHeader = isOpticsSection ? "Rx Power" : "FEC BER";
  const hostCountColumnSettings = {
    headerStyle: "min-width: 120px; width: 120px;",
    style: "min-width: 120px; width: 120px;",
  };
  const statusField = isHostTransceiverOpticsSection(sectionTitle)
    ? "RX Status"
    : "Raw BER Status";

  return [
    { headerText: "Host Name", field: "Host Name", id: "Host Name", resizable: "enabled", sortable: "enabled" },
    { headerText: "Host Port", field: "Port Name", id: "Port Name", resizable: "enabled", sortable: "enabled" },
    {
      headerText: metricHeader,
      field: metricField,
      id: metricField,
      ...(isOpticsSection
        ? { template: "rxPowerTemplate", ...RX_POWER_COLUMN_SETTINGS }
        : { template: "plainRawBerTemplate", ...RAW_BER_COLUMN_SETTINGS }),
    },
    {
      headerText: "Status",
      field: statusField,
      id: statusField,
      resizable: "enabled",
      sortable: "enabled",
      ...hostCountColumnSettings,
    },
    {
      headerText: "Last Updated",
      field: "Last Updated",
      id: "Last Updated",
      template: "relativeTimestampTemplate",
      resizable: "enabled",
      sortable: "enabled",
    },
    {
      headerText: "Patch Panel Matrix",
      field: "patchPanelMatrix",
      id: "patchPanelMatrix",
      template: "patchPanelMatrixTemplate",
      ...PATCH_PANEL_COLUMN_SETTINGS,
    },
  ];
}

function hasRenderableValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim() !== "";
  }

  return value !== null && value !== undefined;
}

function buildGpuLldpColumns(sectionRows: ValidationTableRow[], hideLastExecuted: boolean = false): any[] {
  const shouldShowLastExecuted = sectionRows.some((row) =>
    hasRenderableValue(row["Last Executed"] ?? row.lastExecuted)
  ) && !hideLastExecuted;
  const shouldShowErrorMessage = sectionRows.some((row) =>
    hasRenderableValue(row.errorMessage ?? row["Error Message"])
  );

  const columns = [...GPU_COMPUTE_LLDP_FAILURE_COLUMNS];

  if (!shouldShowErrorMessage) {
    return shouldShowLastExecuted
      ? [
          ...columns.slice(0, 2),
          {
            headerText: "Last Executed",
            field: "Last Executed",
            id: "Last Executed",
            template: "relativeTimestampTemplate",
            resizable: "enabled",
            sortable: "enabled",
          },
        ]
      : columns.slice(0, 2);
  }

  if (!shouldShowLastExecuted) {
    return columns;
  }

  return [
    ...columns.slice(0, 2),
    {
      headerText: "Last Executed",
      field: "Last Executed",
      id: "Last Executed",
      template: "relativeTimestampTemplate",
      resizable: "enabled",
      sortable: "enabled",
    },
    columns[2],
  ];
}

function getChipLabel(sectionTitle: string): string {
  const normalized = normalizeSectionTitle(sectionTitle);
  if (normalized === "lldp errors") return "LLDP";
  if (normalized === "optic errors") return "OPT";
  if (normalized === "interface errors") return "INT";
  if (normalized === "fec_ber errors") return "FEC";
  if (normalized === "fan errors") return "FAN";
  if (normalized === "raw ber errors") return "BER";
  return sectionTitle.replace(/\s+errors$/i, "").slice(0, 4).toUpperCase();
}

function getChipClass(sectionTitle: string): string {
  const normalized = normalizeSectionTitle(sectionTitle);
  if (normalized === "lldp errors") return "chip-lldp";
  if (normalized === "optic errors") return "chip-opt";
  if (normalized === "interface errors") return "chip-int";
  if (normalized === "fec_ber errors") return "chip-fec";
  if (normalized === "fan errors") return "chip-fan";
  if (normalized === "raw ber errors") return "chip-raw-ber";
  return "";
}

const EMPTY_DEVICE_FAILURES: DeviceValidationFailures = {
  deviceName: "",
  lastValidated: null,
  reachability: null,
  sections: {},
  sectionOrder: [],
  powerRows: [],
  counts: {
    bySection: {},
    power: 0,
    nonPowerTotal: 0,
    overallTotal: 0,
  },
  hasPsuFailure: false,
};


function buildDeviceFailuresFallback(deviceName: string): DeviceValidationFailures {
  return {
    ...EMPTY_DEVICE_FAILURES,
    deviceName,
  };
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

const VALIDATION_STATE_LEGEND_ITEMS = [
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

const VALIDATION_STATE_LEGEND_ARIA_LABEL = VALIDATION_STATE_LEGEND_ITEMS
  .map((item) => `${item.state}: ${item.description}`)
  .join(". ");

function renderDeviceInformationSection(
  device: DeviceStatus,
  idx: number,
  _accessibility: typeof VALIDATION_TABLE_ACCESSIBILITY,
  region: string
) {
  const readinessStatus = String(device.hostReadinessStatus || "").trim().toUpperCase();
  const deviceName = String(device.deviceName || "").trim() || "-";
  const hostSerial = String(device.hostSerial || "").trim();
  const instanceId = device.hostInstanceId == null ? "-" : String(device.hostInstanceId).trim() || "-";
  const hopsState = String(device.hostHopsState || "").trim() || "-";
  const computeState = String(device.hostComputeState || "").trim() || "-";
  const computePool = String(device.hostComputePool || "").trim() || "-";
  const ticketIds = Array.isArray(device.hostTicketIds)
    ? device.hostTicketIds.filter((ticketId) => String(ticketId).trim() !== "")
    : [];
  const lvvTicketIds = ticketIds.filter((ticketId) => String(ticketId).trim().toUpperCase().startsWith("LVV"));
  const repairTicketIds = ticketIds.filter((ticketId) => !String(ticketId).trim().toUpperCase().startsWith("LVV"));

  if (!readinessStatus || !hostSerial) {
    return null;
  }

  const showLvvTicketIds = readinessStatus === "LVV";
  const showRepairTicketIds = readinessStatus === "CPV-REPAIR";
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
    ...(showLvvTicketIds && lvvTicketIds.length > 0
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
    ...(showRepairTicketIds && repairTicketIds.length > 0
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
      class="oj-accordion-collapsible"
      expanded={false}
      onojBeforeExpand={(event: Event) => event.stopPropagation()}
      onojBeforeCollapse={(event: Event) => event.stopPropagation()}
    >
      <div slot="header" className="test-section-header" role="heading" aria-level={4}>
        <span>Device Information</span>
      </div>
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
  if (field === "lastExecuted" || field === "Last Executed") return "relativeTimestampTemplate";

  if (field === "sourceDeviceLocation" || field === "Source Device Location") {
    return "sourceDeviceLocationTemplate";
  }

  if (field === "errorMessage") {
    return normalizedSectionTitle === "optic errors"
      ? "gpuMultilineErrorMessageTemplate"
      : "errorMessageClampTemplate";
  }
  if (field === "Error Message") {
    return normalizedSectionTitle === "optic errors"
      ? "gpuMultilineErrorMessageTemplate"
      : "errorMessageClampTemplate";
  }

  return undefined;
}

function getSectionColumns(
  sectionTitle: string,
  sectionRows: ValidationTableRow[],
  isGpuRack?: boolean,
  hideLastExecuted: boolean = false
): any[] {
  if (isHostTransceiverOpticsSection(sectionTitle) || isHostTransceiverFecBerSection(sectionTitle)) {
    return buildHostTransceiverColumns(sectionTitle);
  }

  if (Boolean(isGpuRack) && isGpuLldpSection(sectionTitle, sectionRows)) {
    return buildGpuLldpColumns(sectionRows, hideLastExecuted);
  }

  if (Boolean(isGpuRack) && isGpuFecBerSection(sectionTitle, sectionRows)) {
    return buildGpuFecBerColumns(sectionRows);
  }

  if (isFecBerSection(sectionTitle) && !isGpuRack) {
    const shouldShowErrorMessage = sectionRows.some((row) => {
      const errorMessage = row?.errorMessage;
      return typeof errorMessage === "string" && errorMessage.trim() !== "";
    });

    return shouldShowErrorMessage
      ? FEC_BER_FAILURE_COLUMNS
      : FEC_BER_FAILURE_COLUMNS.filter((column) => column.field !== "errorMessage");
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
      ) return;
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
      .filter((field) => !(hideLastExecuted && (field === "Last Executed" || field === "lastExecuted")))
      .map((field) => {
        const template = getColumnTemplate(sectionTitle, field);
        const widthOverrides =
          field === "rxPower" || field === "Rx Power"
            ? RX_POWER_COLUMN_SETTINGS
            : field === "opticalRawBer" || field === "Optical RawBer"
              ? RAW_BER_COLUMN_SETTINGS
            : field === "patchPanelMatrix"
              ? PATCH_PANEL_COLUMN_SETTINGS
              : {};
        return {
          headerText: field,
          field,
          id: field,
          resizable: "enabled",
          sortable: "enabled",
          ...widthOverrides,
          ...(template ? { template } : {}),
        };
      });
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

function addPatchPanelToSectionRows(
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

function getPsuStatusLabel(jobStatus: string, hasPsuFailure: boolean): "UP" | "DOWN" | "-" {
  const normalized = (jobStatus || "").toUpperCase();
  if (normalized !== "COMPLETED" && normalized !== "DEVICE_UNREACHABLE") {
    return "-";
  }
  return hasPsuFailure ? "DOWN" : "UP";
}

function getDisplayValidationTimestamp(
  deviceName: string,
  deviceFailures: DeviceValidationFailures,
  deviceRefreshTimestampsByName: Record<string, string | null>
): string | null | undefined {
  if (Object.prototype.hasOwnProperty.call(deviceRefreshTimestampsByName, deviceName)) {
    return deviceRefreshTimestampsByName[deviceName];
  }

  return deviceFailures.lastValidated;
}

const DeviceAccordion = (props: Props) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [expandedSectionGroupKeys, setExpandedSectionGroupKeys] = useState<Set<string>>(new Set());
  const [expandedChildSectionKeys, setExpandedChildSectionKeys] = useState<Set<string>>(new Set());
  const [userCollapsedRememberedChildSectionKeys, setUserCollapsedRememberedChildSectionKeys] = useState<Set<string>>(new Set());
  const [accordionNonce, setAccordionNonce] = useState(0);
  const [validationReferenceTimeMs, setValidationReferenceTimeMs] = useState<number>(Date.now());
  const previousFilteredFailuresRef = useRef<ValidationFailuresByDevice>({});
  const stableHostTransceiverTimestampRef = useRef<Map<string, StableHostTransceiverTimestamp>>(new Map());
  const accordionRootRef = useRef<HTMLDivElement | null>(null);
  const pendingViewportAnchorRef = useRef<{ deviceKey: string; topOffset: number } | null>(null);
  const collapsingDeviceKeysRef = useRef<Set<string>>(new Set());
  const collapsingSectionGroupKeysRef = useRef<Set<string>>(new Set());
  const viewMode: RackValidationViewMode = props.viewMode || "ncp";
  const validationServiceView = viewMode === "validationService";
  const showSelection = props.showSelection !== false;

  useEffect(() => {
    stableHostTransceiverTimestampRef.current.clear();
  }, [props.building, props.block, props.rack, props.rack_serial]);

  const isPeriodicValidationDevice = useCallback(
      (deviceName: string): boolean => props.periodicValidationDeviceNames.has(deviceName),
      [props.periodicValidationDeviceNames]
  );

  useEffect(() => {
    if (typeof props.externalExpandedKeysNonce === "number") {
      setAccordionNonce((n) => n + 1);
      const next = props.externalExpandedKeys ? new Set(props.externalExpandedKeys) : new Set<string>();
      setExpandedKeys(next);
    }
  }, [props.externalExpandedKeysNonce, props.externalExpandedKeys]);

  const filteredFailuresByDevice = useMemo(() => {
    const previousFilteredFailures = previousFilteredFailuresRef.current;
    const filtered: ValidationFailuresByDevice = {};
    Object.entries(props.validationFailuresByDevice).forEach(([deviceName, deviceFailures]) => {
      const previousDeviceFailures = previousFilteredFailures[deviceName];
      const sections: Record<string, ValidationSection> = {};
      const countsBySection: Record<string, number> = {};
      let nonPowerTotal = 0;
      const orderedSectionKeys = orderValidationSectionKeys(
        deviceFailures.sectionOrder,
        (sectionKey) => deviceFailures.sections[sectionKey]?.title
      );

      orderedSectionKeys.forEach((sectionKey) => {
        const section = deviceFailures.sections[sectionKey];
        if (!section) return;

        const filteredRows = props.hideUnsupported && isLldpSection(section.title)
            ? section.rows.filter((row) => String(row.linkStatus).toUpperCase() !== "UNSUPPORTED")
            : section.rows;
        const enrichedRows = addPatchPanelToSectionRows(
            section.title,
            filteredRows,
            props.patchPanelByDevicePort
        );

        const nextSection: ValidationSection = {
          ...section,
          rows: enrichedRows,
        };
        const previousSection = previousDeviceFailures?.sections?.[sectionKey];
        sections[sectionKey] =
          previousSection &&
          previousSection.title === nextSection.title &&
          areValidationTableRowsEqual(previousSection.rows, nextSection.rows)
            ? previousSection
            : nextSection;
        countsBySection[sectionKey] = enrichedRows.length;
        nonPowerTotal += enrichedRows.length;
      });

      const nextDeviceFailures: DeviceValidationFailures = {
        ...deviceFailures,
        sections,
        sectionOrder: orderedSectionKeys,
        counts: {
          bySection: countsBySection,
          power: deviceFailures.powerRows.length,
          nonPowerTotal,
          overallTotal: nonPowerTotal + deviceFailures.powerRows.length,
        },
        hasPsuFailure: deviceFailures.powerRows.length > 0,
      };
      filtered[deviceName] =
        previousDeviceFailures &&
        previousDeviceFailures.lastValidated === nextDeviceFailures.lastValidated &&
        previousDeviceFailures.reachability === nextDeviceFailures.reachability &&
        previousDeviceFailures.hasPsuFailure === nextDeviceFailures.hasPsuFailure &&
        areStringArraysEqual(previousDeviceFailures.sectionOrder, nextDeviceFailures.sectionOrder) &&
        areStringArraysEqual(previousDeviceFailures.presentSectionKeys, nextDeviceFailures.presentSectionKeys) &&
        areStringArraysEqual(previousDeviceFailures.periodicSectionKeys, nextDeviceFailures.periodicSectionKeys) &&
        previousDeviceFailures.powerRows === nextDeviceFailures.powerRows &&
        areStringArraysEqual(Object.keys(previousDeviceFailures.sections).sort(), Object.keys(sections).sort()) &&
        orderedSectionKeys.every((sectionKey) => previousDeviceFailures.sections[sectionKey] === sections[sectionKey])
          ? previousDeviceFailures
          : nextDeviceFailures;
    });

    const filteredDeviceNames = Object.keys(filtered).sort();
    const previousDeviceNames = Object.keys(previousFilteredFailures).sort();
    const nextFilteredFailures =
      areStringArraysEqual(filteredDeviceNames, previousDeviceNames) &&
      filteredDeviceNames.every((deviceName) => previousFilteredFailures[deviceName] === filtered[deviceName])
        ? previousFilteredFailures
        : filtered;

    previousFilteredFailuresRef.current = nextFilteredFailures;

    return nextFilteredFailures;
  }, [props.validationFailuresByDevice, props.hideUnsupported, props.patchPanelByDevicePort]);

  const captureViewportAnchor = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const root = accordionRootRef.current;
    if (!root) {
      return null;
    }

    const deviceRows = Array.from(root.querySelectorAll<HTMLElement>("[data-device-key]"));
    if (deviceRows.length === 0) {
      return null;
    }

    const firstVisibleRow = deviceRows.find((row) => row.getBoundingClientRect().bottom > 0);
    if (!firstVisibleRow) {
      return null;
    }

    return {
      deviceKey: firstVisibleRow.getAttribute("data-device-key") || "",
      topOffset: firstVisibleRow.getBoundingClientRect().top,
    };
  }, []);

  useLayoutEffect(() => {
    const pendingAnchor = pendingViewportAnchorRef.current;
    if (!pendingAnchor || typeof window === "undefined") {
      return;
    }

    pendingViewportAnchorRef.current = null;
    const root = accordionRootRef.current;
    if (!root) {
      return;
    }

    const restoreViewportAnchor = () => {
      const targetRow = Array.from(root.querySelectorAll<HTMLElement>("[data-device-key]")).find(
        (row) => row.getAttribute("data-device-key") === pendingAnchor.deviceKey
      );
      if (!targetRow) {
        return;
      }

      const deltaY = targetRow.getBoundingClientRect().top - pendingAnchor.topOffset;
      if (Math.abs(deltaY) > 1) {
        window.scrollBy({
          left: 0,
          top: deltaY,
          behavior: "auto",
        });
      }
    };

    restoreViewportAnchor();
    let secondFrameId = 0;
    let thirdFrameId = 0;
    const firstFrameId = window.requestAnimationFrame(() => {
      restoreViewportAnchor();
      secondFrameId = window.requestAnimationFrame(() => {
        restoreViewportAnchor();
        thirdFrameId = window.requestAnimationFrame(restoreViewportAnchor);
      });
    });
    const delayedRestoreId = window.setTimeout(restoreViewportAnchor, 80);
    const finalRestoreId = window.setTimeout(restoreViewportAnchor, 180);

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId) {
        window.cancelAnimationFrame(secondFrameId);
      }
      if (thirdFrameId) {
        window.cancelAnimationFrame(thirdFrameId);
      }
      window.clearTimeout(delayedRestoreId);
      window.clearTimeout(finalRestoreId);
    };
  }, [filteredFailuresByDevice]);

  useLayoutEffect(() => {
    return () => {
      pendingViewportAnchorRef.current = captureViewportAnchor();
    };
  }, [captureViewportAnchor, filteredFailuresByDevice]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncLayout = () => {
      syncExpandedCollapsibleLayout(accordionRootRef.current, expandedKeys);
    };

    syncLayout();
    let thirdFrameId = 0;
    const firstFrameId = window.requestAnimationFrame(syncLayout);
    const secondFrameId = window.requestAnimationFrame(() => {
      thirdFrameId = window.requestAnimationFrame(syncLayout);
    });
    const timeoutId = window.setTimeout(syncLayout, 120);

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
      if (thirdFrameId) {
        window.cancelAnimationFrame(thirdFrameId);
      }
      window.clearTimeout(timeoutId);
    };
  }, [expandedKeys, filteredFailuresByDevice]);

  const selectTemplate = (
      context: any,
      disabled: boolean = false,
      disabledReason: string = "",
      hidden: boolean = false
  ) => {
    const row = (context?.item && context.item.data) || {};
    const key = row._key;
    const isChecked = props.selectedLinkKeys.has(key);
    if (hidden) {
      return <span className="device-selection-placeholder" title={disabledReason}>-</span>;
    }
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

  const buildSectionGroupKey = (deviceKey: string, groupKey: string): string => `${deviceKey}|${groupKey}`;

  const buildChildSectionKey = (deviceKey: string, groupKey: string, sectionKey: string): string =>
    `${deviceKey}|${groupKey}|${sectionKey}`;

  const shouldRememberChildCollapse = (groupKey: string): boolean =>
    groupKey === T0_TO_HOST_GROUP_KEY || groupKey === HOST_TRANSCEIVER_GROUP_KEY;

  const handleSectionGroupExpandedChange = (
    deviceKey: string,
    group: ValidationSectionGroup,
    expanded: boolean
  ) => {
    const groupKey = buildSectionGroupKey(deviceKey, group.key);
    if (expanded) {
      collapsingSectionGroupKeysRef.current.delete(groupKey);
    } else {
      collapsingSectionGroupKeysRef.current.add(groupKey);
    }

    setExpandedSectionGroupKeys((prev) => {
      const next = new Set(prev);
      if (expanded) {
        next.add(groupKey);
      } else {
        next.delete(groupKey);
      }
      return next;
    });

    if (expanded) {
      setExpandedChildSectionKeys((prev) => {
        const next = new Set(prev);
        group.sections.forEach((section) => {
          const childKey = buildChildSectionKey(deviceKey, group.key, section.key);
          if (!shouldRememberChildCollapse(group.key) || !userCollapsedRememberedChildSectionKeys.has(childKey)) {
            next.add(childKey);
          }
        });
        return next;
      });
    }
  };

  const collapseValidationGroupsForDevice = (deviceKey: string) => {
    setExpandedSectionGroupKeys((prev) => {
      const next = new Set(prev);
      Array.from(next).forEach((groupKey) => {
        if (groupKey.startsWith(`${deviceKey}|`)) {
          next.delete(groupKey);
        }
      });
      return next;
    });

    setExpandedChildSectionKeys((prev) => {
      const next = new Set(prev);
      Array.from(next).forEach((childKey) => {
        if (childKey.startsWith(`${deviceKey}|`)) {
          next.delete(childKey);
        }
      });
      return next;
    });
  };

  const handleChildSectionExpandedChange = (
    deviceKey: string,
    groupKey: string,
    sectionKey: string,
    expanded: boolean
  ) => {
    const builtGroupKey = buildSectionGroupKey(deviceKey, groupKey);
    const childKey = buildChildSectionKey(deviceKey, groupKey, sectionKey);
    const isParentDrivenCollapse =
      !expanded &&
      (collapsingDeviceKeysRef.current.has(deviceKey) ||
        collapsingSectionGroupKeysRef.current.has(builtGroupKey));

    if (shouldRememberChildCollapse(groupKey) && !isParentDrivenCollapse) {
      setUserCollapsedRememberedChildSectionKeys((prev) => {
        const next = new Set(prev);
        if (expanded) {
          next.delete(childKey);
        } else {
          next.add(childKey);
        }
        return next;
      });
    }

    setExpandedChildSectionKeys((prev) => {
      const next = new Set(prev);
      if (expanded) {
        next.add(childKey);
      } else {
        next.delete(childKey);
      }
      return next;
    });
  };

  const renderValidationSectionGroup = (
    device: DeviceStatus,
    deviceIndex: number,
    group: ValidationSectionGroup
  ) => {
    const groupKey = buildSectionGroupKey(device._key, group.key);
    const rowCount = getValidationSectionGroupRowCount(group);

    return (
      <oj-collapsible
        id={`device-${deviceIndex}-${group.key}`}
        key={`${device.deviceName}-${group.key}`}
        class="oj-accordion-collapsible"
        expanded={expandedSectionGroupKeys.has(groupKey)}
        onojBeforeExpand={(event: Event) => {
          event.stopPropagation();
          handleSectionGroupExpandedChange(device._key, group, true);
        }}
        onojBeforeCollapse={(event: Event) => {
          event.stopPropagation();
          handleSectionGroupExpandedChange(device._key, group, false);
        }}
      >
        <div slot="header" className="test-section-header" role="heading" aria-level={4}>
          <span>{group.title}</span>
          <span className="test-section-count">{rowCount}</span>
        </div>
        <div className="oj-flex">
          <div className="oj-flex-item rack-panel table-wrapper-full">
            <oj-accordion
              id={`device-${deviceIndex}-${group.key}-children`}
              multiple={true}
            >
              {group.sections.map((section) => {
                const childKey = buildChildSectionKey(device._key, group.key, section.key);
                return (
                  <MemoizedValidationSectionTable
                    key={`${device.deviceName}-${group.key}-${section.key}`}
                    deviceIndex={deviceIndex}
                    deviceName={device.deviceName}
                    isGpuRack={props.isGpuRack}
                    hideLastExecuted={hideLastExecutedColumn}
                    section={section}
                    expanded={expandedChildSectionKeys.has(childKey)}
                    onExpandedChange={(expanded) =>
                      handleChildSectionExpandedChange(device._key, group.key, section.key, expanded)
                    }
                  />
                );
              })}
            </oj-accordion>
          </div>
        </div>
      </oj-collapsible>
    );
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
          return getNextValidationColorTransitionAtMs(
            getDisplayValidationTimestamp(
              device.deviceName,
              deviceFailures,
              props.deviceRefreshTimestampsByName
            ) ?? null,
            currentTimeMs
          );
        })
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    if (upcomingColorTransitionTimesMs.length === 0) {
      return;
    }

    const earliestTransitionTimeMs = Math.min(...upcomingColorTransitionTimesMs);
    const waitDurationMs = Math.max(1000, earliestTransitionTimeMs - currentTimeMs);
    const transitionTimeoutId = window.setTimeout(() => {
      setValidationReferenceTimeMs(Date.now());
    }, waitDurationMs);

    return () => {
      window.clearTimeout(transitionTimeoutId);
    };
  }, [sortedDevices, filteredFailuresByDevice, validationReferenceTimeMs, props.deviceRefreshTimestampsByName]);

  const hasHostTransceiverLastUpdatedTimestamps = useMemo(
    () =>
      Object.values(filteredFailuresByDevice).some((deviceFailures) =>
        deviceFailures.sectionOrder.some((sectionKey) =>
          isHostTransceiverSection(deviceFailures.sections[sectionKey]?.title) &&
          deviceFailures.sections[sectionKey]?.rows.some((row) => getRowTextValue(row, ["Last Updated"]) !== "")
        )
      ),
    [filteredFailuresByDevice]
  );

  const shouldRefreshRelativeTimestamps =
    props.periodicValidationDeviceNames.size > 0 || hasHostTransceiverLastUpdatedTimestamps;

  useEffect(() => {
    if (!shouldRefreshRelativeTimestamps) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setValidationReferenceTimeMs(Date.now());
    }, VALIDATION_TIMESTAMP_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [shouldRefreshRelativeTimestamps]);

  const showReachabilityColumn = props.periodicValidationEnabled;
  const showPsuColumn = !validationServiceView;
  const showLastValidatedColumn = !validationServiceView;
  const showValidationStateColumn = props.isGpuRack;
  const hideLastExecutedColumn = validationServiceView;
  const deviceAccordionColumns = [
    ...(showSelection ? ["minmax(24px, 28px)"] : []),
    "minmax(260px, 1.45fr)",
    "minmax(64px, 96px)",
    "minmax(260px, 1.9fr)",
    ...(showReachabilityColumn ? ["minmax(92px, 118px)"] : []),
    ...(showPsuColumn ? ["minmax(92px, 126px)"] : []),
    ...(showLastValidatedColumn ? ["minmax(128px, 168px)"] : []),
    ...(showValidationStateColumn ? ["minmax(148px, 188px)"] : []),
    "minmax(136px, 176px)",
  ].join(" ");
  const deviceAccordionColumnStyle = {
    "--device-accordion-cols": deviceAccordionColumns,
  };

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

  const hostTransceiverMetricDeviceNames = useMemo(
    () =>
      new Set(
        props.devices
          .filter((device) =>
            isGpuComputeDevice(device.deviceName, props.isGpuRack) &&
            shouldDisplayHostTransceiverMetrics(device.hostReadinessStatus)
          )
          .map((device) => device.deviceName)
      ),
    [props.devices, props.isGpuRack]
  );

  const summaryCounts = useMemo(() => {
    const values = Object.values(filteredFailuresByDevice);
    const linkFailures = values.reduce((sum, item) => sum + countT0ToHostRows(item), 0);
    const powerFailures = values.filter(
        (item) => !isGpuComputeDevice(item.deviceName, props.isGpuRack) && item.hasPsuFailure
    ).length;
    return {
      linkFailures,
      powerFailures,
      hostTransceiver: summarizeHostTransceiverRows(
        filteredFailuresByDevice,
        props.isGpuRack ? hostTransceiverMetricDeviceNames : undefined
      ),
    };
  }, [filteredFailuresByDevice, hostTransceiverMetricDeviceNames, props.isGpuRack]);

  const renderErrorCount = (
      device: DeviceStatus,
      deviceFailures: DeviceValidationFailures
  ) => {
    const isGpuCompute = isGpuComputeDevice(deviceFailures.deviceName, props.isGpuRack);
    const readinessStatus = String(device.hostReadinessStatus || "").trim().toUpperCase();
    const showNotReadyForLvvChip =
      isGpuCompute &&
      readinessStatus !== "" &&
      !READINESS_STATES_WITH_REAL_ERRORS.has(readinessStatus);
    const showHostTransceiverMetrics =
      isGpuCompute && shouldDisplayHostTransceiverMetrics(readinessStatus);
    const notReadyForLvvChip = showNotReadyForLvvChip
      ? [{
        label: NOT_READY_FOR_LVV_LABEL,
        count: 1,
        typeClass: "chip-not-ready-for-lvv",
        title: NOT_READY_FOR_LVV_TOOLTIP,
        ariaLabel: NOT_READY_FOR_LVV_TOOLTIP,
      }]
      : [];

    if (showNotReadyForLvvChip) {
      return (
        <span className="device-accordion-error-breakdown">
          {renderErrorChipRow(notReadyForLvvChip)}
        </span>
      );
    }

    const t0ToHostChips = deviceFailures.sectionOrder
        .map((sectionKey) => {
          const section = deviceFailures.sections[sectionKey];
          if (!section) return null;
          if (isHostTransceiverSection(section.title)) return null;
          return {
            label: getChipLabel(section.title),
            count: deviceFailures.counts.bySection[sectionKey] || 0,
            typeClass: getChipClass(section.title),
          };
        })
        .filter((entry): entry is { label: string; count: number; typeClass: string } =>
            Boolean(entry && entry.count > 0)
        );
    const hostTransceiverChips = getHostTransceiverErrorChips(
      deviceFailures,
      showHostTransceiverMetrics
    );

    if (
      notReadyForLvvChip.length === 0 &&
      t0ToHostChips.length === 0 &&
      hostTransceiverChips.length === 0
    ) {
      const zeroClass = `device-accordion-failure-count ${
          !isGpuCompute && deviceFailures.hasPsuFailure
              ? "danger"
              : "success"
      }`;
      return <span className={zeroClass}>0</span>;
    }

    return (
        <span className="device-accordion-error-breakdown">
          {renderErrorChipRow(notReadyForLvvChip)}
          {renderErrorChipRow(t0ToHostChips)}
          {renderErrorChipRow(hostTransceiverChips)}
      </span>
    );
  };

  const renderLastValidated = (device: DeviceStatus, deviceFailures: DeviceValidationFailures) => {
    if (validationServiceView) {
      return <span className="device-last-validated-na">N/A</span>;
    }

    if (isPeriodicValidationDevice(device.deviceName)) {
      return <span className="device-last-validated-na">N/A</span>;
    }

    if (isDeviceNotEligibleForValidation(device, deviceFailures)) {
      return <span className="device-last-validated-na">N/A</span>;
    }

    if (!isDeviceStatusCompleted(device.jobStatus)) {
      return null;
    }

    const displayTimestamp = getDisplayValidationTimestamp(
      device.deviceName,
      deviceFailures,
      props.deviceRefreshTimestampsByName
    );
    const validationColor = resolveValidationAgeColor(displayTimestamp, validationReferenceTimeMs);
    const relativeValidationAge = formatValidationTimestamp(displayTimestamp, validationReferenceTimeMs);
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

  const renderReachability = (device: DeviceStatus, deviceFailures: DeviceValidationFailures) => {
    if (!showReachabilityColumn) {
      return null;
    }

    if (isGpuComputeDevice(device.deviceName, props.isGpuRack)) {
      return <span className="device-last-validated-na">N/A</span>;
    }

    if (!isPeriodicValidationDevice(device.deviceName)) {
      return <span className="device-last-validated-na">N/A</span>;
    }

    if (deviceFailures.reachability === true) {
      return (
        <span className="device-reachability-indicator reachable" title="Reachable" aria-label="Reachable">
          ✓
        </span>
      );
    }

    if (deviceFailures.reachability === null || deviceFailures.reachability === undefined) {
      return (
        <span className="device-reachability-indicator unknown" title="Unknown" aria-label="Reachability unknown">
          ?
        </span>
      );
    }

    return (
      <span className="device-reachability-indicator unreachable" title="Unreachable" aria-label="Unreachable">
        ✗
      </span>
    );
  };

  const renderStatusCell = (statusToRender: string) => {
    return (
        <span className={`device-accordion-status ${getStatusClass(statusToRender)}`}>
          {formatStatusLabel(statusToRender)}
        </span>
    );
  };

  const renderValidationState = (device: DeviceStatus, isGpuCompute: boolean) => {
    if (!isGpuCompute) {
      return <span className="device-last-validated-na">N/A</span>;
    }

    if (device.hostReadinessLoading) {
      return (
        <span className="device-host-state-loading" aria-label="Validation state loading" title="Validation state loading">
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
                    if (validationServiceView) {
                      const enabledCount = props.devices.filter((d) =>
                        isPeriodicValidationDevice(d.deviceName)
                      ).length;
                      const notEnabledCount = Math.max(0, props.devices.length - enabledCount);

                      return (
                        <div class="device-accordion-summary-card info">
                          <div>
                            <span class="device-accordion-message-title">
                              Validation Service is enabled for {enabledCount} device(s).
                            </span>
                            <span class="device-accordion-message-title">
                              {notEnabledCount} device(s) are Not Enabled for Validation Service.
                            </span>
                          </div>
                        </div>
                      );
                    }

                    const eligibleDevices = props.devices.filter((d) =>
                        props.eligibleDeviceNames.has(d.deviceName)
                    );
                    const periodicDevices = props.devices.filter((d) =>
                        isPeriodicValidationDevice(d.deviceName)
                    );
                    const onDemandDevices = validationServiceView
                      ? eligibleDevices.filter((d) => !isPeriodicValidationDevice(d.deviceName))
                      : eligibleDevices;
                    const hasEligibleDevices = eligibleDevices.length > 0;
                    const hasOnDemandDevices = onDemandDevices.length > 0;
                    const numUnreachable = eligibleDevices.filter((d) => d.jobStatus === "DEVICE_UNREACHABLE").length;
                    const hasAnyValidated = eligibleDevices.some(
                        (d) => d.jobStatus !== "NOT_TRIGGERED" && d.jobStatus !== "IN_PROGRESS"
                    );
                    if (validationServiceView && !hasOnDemandDevices && periodicDevices.length > 0) {
                      return (
                          <div class="device-accordion-summary-card info">
                            <div>
                              <span class="device-accordion-message-title">
                                {periodicDevices.length} device(s) use Periodic Check in this rack.
                              </span>
                              <span class="device-accordion-message-title">
                                No devices on this tab currently support on-demand validation.
                              </span>
                            </div>
                          </div>
                      );
                    }
                    if (validationServiceView && hasOnDemandDevices && !hasAnyValidated) {
                      return (
                          <div class="device-accordion-summary-card info">
                            <div>
                              <span class="device-accordion-message-title">
                                Click Validate to run on-demand validation for {onDemandDevices.length} device(s).
                              </span>
                              {periodicDevices.length > 0 && (
                                <span class="device-accordion-message-title">
                                  {periodicDevices.length} device(s) use Periodic Check.
                                </span>
                              )}
                            </div>
                          </div>
                      );
                    }
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
                              {summaryCounts.hostTransceiver.total > 0 && (
                                <span class="device-accordion-message-title">
                                  Host Transceiver: Fail {summaryCounts.hostTransceiver.fail},
                                  Stale {summaryCounts.hostTransceiver.stale}
                                </span>
                              )}
                              {periodicDevices.length > 0 && (
                              <span class="device-accordion-message-title">
                        {periodicDevices.length} device(s) use Periodic Check.
                      </span>
                              )}
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

              {!validationServiceView && (
              <div class="device-last-validated-legend full-bleed">
                <span className="device-accordion-legend-title">Last Validated Legend</span>
                <span className="device-accordion-legend-item">
                  <span className="device-last-validated-pill green legend">Up to 2 minutes</span>
                </span>
                <span className="device-accordion-legend-item">
                  <span className="device-last-validated-pill orange legend">Up to 10 minutes</span>
                </span>
                <span className="device-accordion-legend-item">
                  <span className="device-last-validated-pill red legend">Greater than 10 minutes</span>
                </span>
                <span className="device-accordion-legend-item">
                  <span className="device-last-validated-na">N/A</span>
                  Periodic Check devices and devices not eligible for validation
                </span>
              </div>
              )}

              <div
                class="device-accordion-columns-header full-bleed device-table-columns-header"
                style={deviceAccordionColumnStyle as any}
              >
            {showSelection ? (
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
            ) : null}
                <span class="device-col name">Device</span>
                <span class="device-col elevation">Elevation</span>
                <span class="device-col errors">Errors</span>
                {showReachabilityColumn ? (
                  <span class="device-col reachability">Reachability</span>
                ) : null}
                {showPsuColumn ? (
                  <span class="device-col psu-status">PSU Status</span>
                ) : null}
                {showLastValidatedColumn ? (
                  <span class="device-col last-validated">Last Validated</span>
                ) : null}
                {showValidationStateColumn ? (
                  <span class="device-col validation-state">
                    <span className="device-last-validated-header">
                      <span>Validation State</span>
                      <span className="device-tooltip-container">
                        <span
                          className="device-last-validated-tooltip-trigger"
                          aria-label={`Validation State legend: ${VALIDATION_STATE_LEGEND_ARIA_LABEL}`}
                          tabIndex={0}
                        >
                          ?
                        </span>
                        <span className="device-state-legend-tooltip" role="tooltip">
                          {VALIDATION_STATE_LEGEND_ITEMS.map((item) => (
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
                  </span>
                ) : null}
                <span class="device-col status">Status</span>
              </div>
              <div ref={accordionRootRef}>
              <oj-accordion id="deviceAccordion" key={accordionNonce} multiple={true}>
                {sortedDevices.map((device, idx) => {
                  const deviceFailures =
                      filteredFailuresByDevice[device.deviceName] || buildDeviceFailuresFallback(device.deviceName);
                  const visibleSections = deviceFailures.sectionOrder
                      .map((sectionKey) => deviceFailures.sections[sectionKey])
                      .filter((section): section is ValidationSection => Boolean(section && section.rows.length > 0));
                  const isGpuCompute = isGpuComputeDevice(device.deviceName, props.isGpuRack);
                  const readinessStatusUpper = String(device.hostReadinessStatus || "").trim().toUpperCase();
                  const showHostTransceiverMetrics =
                      isGpuCompute && shouldDisplayHostTransceiverMetrics(readinessStatusUpper);
                  const isNotReadyForLvvDevice =
                      isGpuCompute &&
                      readinessStatusUpper !== "" &&
                      !READINESS_STATES_WITH_REAL_ERRORS.has(readinessStatusUpper);
                  const hideValidationSectionsForNotReadyDevice =
                      isNotReadyForLvvDevice && Boolean(props.hideNotReadyDeviceErrors);
                  const validationSectionGroups = isGpuCompute
                      ? applyStableHostTransceiverTimestamps(
                          device.deviceName,
                          buildValidationSectionGroups(visibleSections, showHostTransceiverMetrics),
                          stableHostTransceiverTimestampRef.current,
                          validationReferenceTimeMs
                      )
                      : [];
                  const visibleValidationSectionGroups =
                      hideValidationSectionsForNotReadyDevice
                          ? []
                          : validationSectionGroups;
                  const isPeriodicValidation = isPeriodicValidationDevice(device.deviceName);
                  const hasDeviceInformation = Boolean(isGpuCompute && device.hostReadinessStatus && device.hostSerial);
                  const hasValidationSections = isGpuCompute
                      ? visibleValidationSectionGroups.length > 0
                      : visibleSections.length > 0;
                  const hasVisibleValidationSections = hasValidationSections;
                  const hasExpandableContent = hasVisibleValidationSections || hasDeviceInformation;
                  const psuStatus = isGpuCompute
                      ? "-"
                      : getPsuStatusLabel(device.jobStatus, deviceFailures.hasPsuFailure);
                  const isExpanded = expandedKeys.has(device._key);
                  const isValidationEligible = props.eligibleDeviceNames.has(device.deviceName);
                  const statusToRender = validationServiceView
                      ? (isPeriodicValidation
                          ? (isValidationEligible ? "PERIODIC_CHECK" : "NOT_ELIGIBLE")
                          : (isValidationEligible ? device.jobStatus : "NOT_ELIGIBLE"))
                      : (isValidationEligible ? device.jobStatus : "NOT_ELIGIBLE");
                  const rowSelectionDisabled = gpuRackSelectionDisabled || !props.rackValidationAllowed || !isValidationEligible;
                  const disabledReason =
                      gpuRackSelectionDisabled
                          ? gpuRackSelectionDisabledReason
                          : !props.rackValidationAllowed
                          ? props.rackValidationTooltip
                          : (
                              device.validationEligibilityReason ||
                              "Validation is available only for monitored and deployed devices."
                          );
                  const validationStateContent = props.isGpuRack
                      ? renderValidationState(device, isGpuCompute)
                      : null;

                  return (
                      <oj-collapsible
                          id={`deviceCollapsible-${idx}`}
                          key={device._key}
                          data-device-key={device._key}
                          expanded={isExpanded}
                          onojBeforeExpand={(event: Event) => {
                            if (event.target === event.currentTarget) {
                              collapsingDeviceKeysRef.current.delete(device._key);
                            }
                          }}
                          onojBeforeCollapse={(event: Event) => {
                            if (event.target === event.currentTarget) {
                              collapsingDeviceKeysRef.current.add(device._key);
                            }
                          }}
                          onojExpand={(event: Event) => {
                            if (event.target !== event.currentTarget) {
                              return;
                            }
                            handleToggle(device._key, true, hasExpandableContent);
                          }}
                          onojCollapse={(event: Event) => {
                            if (event.target !== event.currentTarget) {
                              return;
                            }
                            handleToggle(device._key, false, hasExpandableContent);
                            collapseValidationGroupsForDevice(device._key);
                            collapsingDeviceKeysRef.current.delete(device._key);
                          }}
                          disabled={!hasExpandableContent}
                      >
                        <h3 slot="header" style={{ padding: 0, margin: 0, width: "100%" }}>
                          <div className="device-accordion-header-row" style={deviceAccordionColumnStyle as any}>
                            {/* Selection checkbox */}
                            {showSelection ? (
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
                            ) : null}

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

                            <span className="device-col errors">
                              {renderErrorCount(device, deviceFailures)}
                            </span>

                            {showReachabilityColumn ? (
                              <span className="device-col reachability">
                                {renderReachability(device, deviceFailures)}
                              </span>
                            ) : null}

                            {showPsuColumn ? (
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
                            ) : null}

                            {showLastValidatedColumn ? (
                              <span className="device-col last-validated">
                                {renderLastValidated(device, deviceFailures)}
                              </span>
                            ) : null}

                            {validationStateContent && (
                              <span className="device-col validation-state">
                                {validationStateContent}
                              </span>
                            )}

                            {/* Status */}
                            <span className="device-col status">
                        {renderStatusCell(statusToRender)}
                      </span>
                          </div>
                        </h3>

                        {/* Collapsible content */}
                        {hasExpandableContent ? (
                            <div style={{ padding: "8px 24px", background: "#fff" }}>
                              <oj-accordion
                                id={`testAccordion-${idx}`}
                                multiple={true}
                                class="device-validation-sections-accordion"
                              >
                                {isGpuCompute &&
                                  renderDeviceInformationSection(
                                    device,
                                    idx,
                                    VALIDATION_TABLE_ACCESSIBILITY,
                                    props.region
                                  )}
                                {hasVisibleValidationSections &&
                                  (isGpuCompute
                                    ? visibleValidationSectionGroups.map((group) =>
                                      renderValidationSectionGroup(device, idx, group)
                                    )
                                    : visibleSections.map((section) => {
                                      return (
                                          <MemoizedValidationSectionTable
                                              key={`${device.deviceName}-${section.key}`}
                                              deviceIndex={idx}
                                              deviceName={device.deviceName}
                                              isGpuRack={props.isGpuRack}
                                              hideLastExecuted={hideLastExecutedColumn}
                                              section={section}
                                          />
                                      );
                                    }))}
                              </oj-accordion>
                            </div>
                        ) : null}
                      </oj-collapsible>
                  );
                })}
              </oj-accordion>
              </div>
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
