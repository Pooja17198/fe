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
import { formatStatusLabel, getStatusClass } from "./utils";

type Props = {
  devices: DeviceStatus[];
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

  const selectTemplate = (context: any) => {
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
    return <input type="checkbox" checked={isChecked} onChange={onChange} />;
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

  // Compute selection helpers for "Select All" behavior
  const allDeviceKeys = useMemo(() => new Set(sortedDevices.map((d) => d._key)), [sortedDevices]);
  const allSelected =
      allDeviceKeys.size > 0 && Array.from(allDeviceKeys).every((k) => props.selectedLinkKeys.has(k));
  const someSelected =
      allDeviceKeys.size > 0 &&
      Array.from(allDeviceKeys).some((k) => props.selectedLinkKeys.has(k)) &&
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
        allDeviceKeys.forEach((k) => next.add(k));
      } else {
        allDeviceKeys.forEach((k) => next.delete(k));
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
      return <span className="device-accordion-failure-count">0</span>;
    }

    return (
        <span className="device-accordion-error-breakdown">
        {chips.map((chip) => (
            <span key={chip.label} className="device-accordion-error-chip" title={`${chip.label}: ${chip.count}`}>
            {chip.label}:{chip.count}
          </span>
        ))}
      </span>
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
                    const numUnreachable = props.devices.filter((d) => d.jobStatus === "DEVICE_UNREACHABLE").length;
                    const hasAnyValidated = props.devices.some(
                        (d) => d.jobStatus !== "NOT_TRIGGERED" && d.jobStatus !== "IN_PROGRESS"
                    );
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

              <div class="device-accordion-columns-header full-bleed">
            <span class="device-col select">
              <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e: any) => toggleSelectAll((e.target as HTMLInputElement).checked)}
              />
            </span>
                <span>Device</span>
                <span>Elevation</span>
                <span>Errors</span>
                <span>PSU Status</span>
                <span>Status</span>
              </div>
              <oj-accordion id="deviceAccordion" key={accordionNonce} multiple={true}>
                {sortedDevices.map((device, idx) => {
                  const deviceFailures = filteredFailuresByDevice[device.deviceName] || {
                    ...EMPTY_DEVICE_FAILURES,
                    deviceName: device.deviceName,
                  };
                  const hasDeviceFailures = deviceFailures.counts.nonPowerTotal > 0;
                  const psuStatus = getPsuStatusLabel(device.jobStatus, deviceFailures.hasPsuFailure);
                  const isExpanded = expandedKeys.has(device._key);

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
                        {selectTemplate({ item: { data: { _key: device._key } } })}
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

                            {/* Status */}
                            <span className="device-col status">
                        <span className={`device-accordion-status ${getStatusClass(device.jobStatus)}`}>
                          {formatStatusLabel(device.jobStatus)}
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
                                                columns={[...section.columns]}
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
              <span class="device-accordion-empty-title">No devices(in deployed state) found to validate in this rack</span>
            </div>
        )}
      </div>
  );
};
export default DeviceAccordion;