import { h } from "preact";
import { useMemo, useState, useEffect, useRef } from "preact/hooks";
import "ojs/ojaccordion";
import "ojs/ojcollapsible";
import "ojs/ojtable";
import "oj-c/button";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

import { DeviceStatus, DeviceValidationFailures, ValidationFailuresByDevice } from "./types";
import { VALIDATION_TABLE_ACCESSIBILITY } from "./constants";
import {
  FAN_FAILURE_COLUMNS,
  FEC_BER_FAILURE_COLUMNS,
  INTERFACE_FAILURE_COLUMNS,
  LLDP_FAILURE_COLUMNS,
  OPTIC_FAILURE_COLUMNS,
} from "./columns";
import { booleanStatusTemplate, lldpStatusTemplate, psuStatusTemplate } from "./templates";
import { formatStatusLabel, getStatusClass, isDeviceStatusCompleted } from "./utils";

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
  region: string;
  validationFailuresByDevice: ValidationFailuresByDevice;
  totalFailureRows: number;
  totalLinkFailureRows: number;
  powerFailureDevices: number;
  selectedLinkKeys: Set<string>;
  setSelectedLinkKeys: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  loading: boolean;
  isValidating: boolean;
  hideUnsupported: boolean;
  externalExpandedKeys?: Set<string>;
  externalExpandedKeysNonce?: number;
};

type TestSectionConfig = {
  id: "lldp" | "optics" | "interfaces" | "fecBer" | "fans";
  title: string;
  columns: any[];
};

const TEST_SECTIONS: TestSectionConfig[] = [
  { id: "lldp", title: "LLDP Errors", columns: LLDP_FAILURE_COLUMNS },
  { id: "optics", title: "Optic Errors", columns: OPTIC_FAILURE_COLUMNS },
  { id: "interfaces", title: "Interface Errors", columns: INTERFACE_FAILURE_COLUMNS },
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


function getSectionColumns(section: TestSectionConfig, sectionRows: any[]): any[] {
  if (section.id !== "fecBer") {
    return [...section.columns];
  }

  const hasErrorMessage = sectionRows.some((row) => {
    const errorMessage = row?.errorMessage;
    return typeof errorMessage === "string" && errorMessage.trim() !== "";
  });

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
    const powerFailures = values.filter((item) => item.hasPsuFailure).length;
    return { linkFailures, powerFailures };
  }, [filteredFailuresByDevice]);

  const renderErrorCount = (deviceFailures: DeviceValidationFailures) => {
    const chips = [
      { label: "LLDP", count: deviceFailures.counts.lldp },
      { label: "OPT", count: deviceFailures.counts.optics },
      { label: "INT", count: deviceFailures.counts.interfaces },
      { label: "FEC", count: deviceFailures.counts.fecBer },
      { label: "FAN", count: deviceFailures.counts.fans },
    ].filter((entry) => entry.count > 0);

    if (chips.length === 0) {
      const zeroClass = `device-accordion-failure-count ${deviceFailures.hasPsuFailure ? "danger" : "success"}`;
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
                  disabled={eligibleDeviceKeys.size === 0}
                  title={
                    eligibleDeviceKeys.size === 0
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
                  const hasDeviceFailures = deviceFailures.counts.nonPowerTotal > 0;
                  const psuStatus = getPsuStatusLabel(device.jobStatus, deviceFailures.hasPsuFailure);
                  const isExpanded = expandedKeys.has(device._key);
                  const isValidationEligible = props.eligibleDeviceNames.has(device.deviceName);
                  const statusToRender = isValidationEligible ? device.jobStatus : "NOT_ELIGIBLE";
                  const disabledReason =
                      device.validationEligibilityReason ||
                      "Validation is available only for monitored and deployed devices.";

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
                            !isValidationEligible,
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

                            <span className="device-col errors">{renderErrorCount(deviceFailures)}</span>

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
                                {TEST_SECTIONS.map((section) => {
                                  const sectionRows = getRowsForSection(deviceFailures, section.id);
                                  if (!sectionRows.length) return null;
                                  const sectionColumns = getSectionColumns(section, sectionRows);
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