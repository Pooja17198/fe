import { h } from "preact";
import { useMemo, useState, useEffect, useRef } from "preact/hooks";
import "ojs/ojaccordion";
import "ojs/ojcollapsible";
import "ojs/ojtable";
import "oj-c/button";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

import { DeviceStatus, ValidationFailure } from "./types";
import { VALIDATION_TABLE_ACCESSIBILITY } from "./constants";
import { VALIDATION_FAILURE_COLUMNS } from "./columns";
import { lldpTemplate, psuTemplate } from "./templates";
import { getStatusClass } from "./utils";



type Props = {
  devices: DeviceStatus[];
  building: string;
  block: string;
  rack: string;
  rack_serial: string;
  region: string;
  validationFailures: ValidationFailure[];
  selectedLinkKeys: Set<string>;
  setSelectedLinkKeys: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  loading: boolean;
  isValidating: boolean;
  hideUnsupported: boolean;
  externalExpandedKeys?: Set<string>;
  externalExpandedKeysNonce?: number;
};


const DeviceAccordion = (props: Props) => {
  const ACC = VALIDATION_TABLE_ACCESSIBILITY;
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [accordionNonce, setAccordionNonce] = useState(0);

  useEffect(() => {
    if (typeof props.externalExpandedKeysNonce === "number") {
      setAccordionNonce(n => n + 1);
      const next = props.externalExpandedKeys ? new Set(props.externalExpandedKeys) : new Set<string>();
      setExpandedKeys(next);
    }
  }, [props.externalExpandedKeysNonce, props.externalExpandedKeys]);

  const filteredValidationFailures = useMemo(
      () => !props.hideUnsupported
          ? props.validationFailures
          : props.validationFailures.filter(row =>
              String(row.lldpStatus).toUpperCase() !== 'UNSUPPORTED'
          ),
      [props.validationFailures, props.hideUnsupported]
  );

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
    return <input type="checkbox" checked={isChecked} onChange={onChange}/>;
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

  const processedValidationFailures = useMemo(
      () => filteredValidationFailures.map(row => ({
        ...row,
        _key: `${row.deviceAName}|||${row.deviceAPort}`,
      })),
      [filteredValidationFailures]
  );

  const sortedDevices = useMemo(() => {
    return [...props.devices].sort((a, b) => ((b.elevation ?? -Infinity) - (a.elevation ?? -Infinity)));
  }, [props.devices]);

  // Compute selection helpers for "Select All" behavior
  const allDeviceKeys = useMemo(() => new Set(sortedDevices.map(d => d._key)), [sortedDevices]);
  const allSelected =
    allDeviceKeys.size > 0 && Array.from(allDeviceKeys).every(k => props.selectedLinkKeys.has(k));
  const someSelected =
    allDeviceKeys.size > 0 &&
    Array.from(allDeviceKeys).some(k => props.selectedLinkKeys.has(k)) &&
    !allSelected;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected, allSelected, props.selectedLinkKeys, sortedDevices]);

  const toggleSelectAll = (checked: boolean) => {
    props.setSelectedLinkKeys(prev => {
      const next = new Set(prev as Set<string>);
      if (checked) {
        allDeviceKeys.forEach(k => next.add(k));
      } else {
        allDeviceKeys.forEach(k => next.delete(k));
      }
      return next;
    });
  };

  return (
      <div class="rack-page">
        {props.loading ? (
          <div class="device-accordion-loader">
            <oj-progress-circle size="md" value={-1} />
          </div>
        ) : (
          props.devices.length > 0 ? (
            <div>
              {/*Validation summary*/}
              {!props.isValidating && (() => {
                const numUnreachable = props.devices.filter(d => d.jobStatus === 'DEVICE_UNREACHABLE').length;
                const hasAnyValidated = props.devices.some(d => d.jobStatus !== 'NOT_TRIGGERED' && d.jobStatus !== 'IN_PROGRESS');
                if (hasAnyValidated) {
                  return (
                    <div class="device-accordion-summary-card info">
                      <div>
                        <span class="device-accordion-message-title">
                          {props.validationFailures.length} link(s) have validation failures
                        </span>
                        <span class="device-accordion-message-title">
                          {numUnreachable} device(s) are unreachable
                        </span>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div class="device-accordion-summary-card info">
                      <div>
                        <span class="device-accordion-message-title">
                          Validation has not been triggered for this rack.
                        </span>
                        <span class="device-accordion-message-title">
                          Please select the devices and hit the Validate button above to run validation.
                        </span>
                      </div>
                    </div>
                  )
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
                <span>Status</span>
              </div>
              <oj-accordion id="deviceAccordion" key={accordionNonce} multiple={true}>
                {sortedDevices.map((device, idx) => {
                  const deviceFailures = processedValidationFailures.filter(
                      row => row.deviceAName === device.deviceName
                  );
                  const hasDeviceFailures = deviceFailures.length > 0;
                  const deviceDataProvider = new ArrayDataProvider(deviceFailures, {keyAttributes: "_key"});
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
                          <h3 slot="header" style={{padding: 0, margin: 0, width: '100%'}}>
                            <div className="device-accordion-header-row">
                              {/* Selection checkbox */}
                              <span className="device-col select" onClick={e => e.stopPropagation()} style={{display: "inline-flex", alignItems: "center", justifyContent: "center"}}>
                                {selectTemplate({item: {data: {_key: device._key}}})}
                              </span>

                              {/* Device name */}
                              <span className="device-col name">
                                <span
                                  className="device-accordion-devicename"
                                  title={device.deviceName}
                                >
                                  {device.deviceName}
                                </span>
                              </span>

                              {/* Elevation */}
                              <span className="device-col elevation" title="Elevation">
                                {typeof device.elevation === 'number' ? device.elevation : '-'}
                              </span>


                              <span className="device-col errors">
                                <span
                                  className="device-accordion-failure-count"
                                  title={`${deviceFailures.length} failure(s)`}
                                >
                                  {deviceFailures.length}
                                </span>
                              </span>

                              {/* Status */}
                              <span className="device-col status">
                                <span className={`device-accordion-status ${getStatusClass(device.jobStatus)}`}>
                                  {device.jobStatus.replace(/_/g, " ").replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())}
                                </span>
                              </span>
                            </div>
                        </h3>

                        {/* Collapsible content */}
                        {hasDeviceFailures ? (
                            <div style={{padding: "8px 24px", background: "#fff"}}>
                              <div className="oj-flex">
                                <div className="oj-flex-item rack-panel table-wrapper-full">
                                  <br/>
                                  <oj-table
                                    class="selectable-table table-full"
                                    display="grid"
                                    horizontal-grid-visible="enabled"
                                    layout="contents"
                                    vertical-grid-visible="enabled"
                                    aria-label="Validation Failure Action Items"
                                    id={`ValidationFailureItemsTable-${idx}`}
                                    accessibility={ACC}
                                    scroll-policy="loadMoreOnScroll"
                                    scroll-policy-options='{"fetchSize": 10}'
                                    columns={[...VALIDATION_FAILURE_COLUMNS]}
                                    data={deviceDataProvider}
                                  >
                                    <template slot="lldpTemplate" render={lldpTemplate}/>
                                    <template slot="psuTemplate" render={psuTemplate}/>
                                  </oj-table>
                                </div>
                              </div>
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
          )
        )}
      </div>
  );
};
export default DeviceAccordion;
