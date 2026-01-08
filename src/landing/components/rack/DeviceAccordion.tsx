import { h } from "preact";
import { useMemo, useState, useEffect } from "preact/hooks";
import "ojs/ojaccordion";
import "ojs/ojcollapsible";
import "ojs/ojtable";
import "oj-c/button";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

type DeviceStatus = {
  deviceName: string;
  jobStatus: string;
  elevation?: number;
  _key: string;
};

interface ValidationFailureDisplayDTO {
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

type Props = {
  devices: DeviceStatus[];
  building: string;
  block: string;
  rack: string;
  rack_serial: string;
  region: string;
  validationFailures: ValidationFailureDisplayDTO[];
  selectedLinkKeys: Set<string>;
  setSelectedLinkKeys: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  hasValidated: boolean;
  rackValidationFailure: string | null;
  loading: boolean;
  isValidating: boolean;
  hideUnsupported: boolean;
  externalExpandedKeys?: Set<string>;
  externalExpandedKeysNonce?: number;
};

const VALIDATION_FAILURE_COLUMNS = [
  { headerText: "Device A Rack", field: "deviceARack", id: "deviceARack", resizable: "enabled" as const, sortable: 'enabled' as const },
  { headerText: "Device A Name", field: "deviceAName", id: "deviceAName", resizable: "enabled" as const, sortable: 'enabled' as const },
  { headerText: "Device A Port", field: "deviceAPort", id: "deviceAPort", resizable: "enabled" as const, sortable: 'enabled' as const },
  { headerText: "Current Device B Rack", field: "deviceBRack", id: "deviceBRack", resizable: "enabled" as const, sortable: 'enabled' as const },
  { headerText: "Current Device B Name", field: "deviceBName", id: "deviceBName", resizable: "enabled" as const, sortable: 'enabled' as const },
  { headerText: "Current Device B Port", field: "deviceBPort", id: "deviceBPort", resizable: "enabled" as const, sortable: 'enabled' as const },
  { headerText: "Expected Device B Rack", field: "deviceBRackExpected", id: "deviceBRackExpected", resizable: "enabled" as const, sortable: 'enabled' as const },
  { headerText: "Expected Device B Name", field: "deviceBNameExpected", id: "deviceBNameExpected", resizable: "enabled" as const, sortable: 'enabled' as const },
  { headerText: "Expected Device B Port", field: "deviceBPortExpected", id: "deviceBPortExpected", resizable: "enabled" as const, sortable: 'enabled' as const },
  { headerText: "LLDP Status", field: "lldpStatus", id: "lldpStatus", template: "lldpTemplate", resizable: "enabled" as const, sortable: 'enabled' as const },
  { headerText: "TX Power", field: "txPower", id: "txPower", resizable: "enabled" as const, sortable: 'enabled' as const },
  { headerText: "RX Power", field: "rxPower", id: "rxPower", resizable: "enabled" as const, sortable: 'enabled' as const },
  { headerText: "PSU Failure", field: "psuFailure", id: "psuFailure", template: "psuTemplate", resizable: "enabled" as const, sortable: 'enabled' as const },
];

const DeviceAccordion = (props: Props) => {
  const ACC = {rowHeader: "ActionItems"};
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

  const lldpTemplate = (context: any) => {
    const row = (context?.item && context.item.data) || {};
    const value: string = (row.lldpStatus || '').toString();
    const isMatch = value.toLowerCase() === 'match';
    const isMismatch = value.toLowerCase() === 'mismatch';
    const colorClass = isMatch ? 'oj-text-color-success' : isMismatch ? 'oj-text-color-danger' : '';
    return <span class={colorClass}>{value}</span>;
  };

  const psuTemplate = (context: any) => {
    const row = (context?.item && context.item.data) || {};
    const hasFailure =
        row.psuFailure !== null &&
        row.psuFailure !== undefined &&
        `${row.psuFailure}`.toLowerCase() !== 'null' &&
        `${row.psuFailure}` !== '';
    return hasFailure
        ? <span class="oj-text-color-danger" aria-label="PSU failure">✗</span>
        : <span class="oj-text-color-success" aria-label="No PSU failure">✓</span>;
  };

  const handleExpandAll = () => {
    setAccordionNonce(n => n + 1);
    const keys = props.devices.filter(device =>
      processedValidationFailures.some(row => row.deviceAName === device.deviceName)
    ).map(d => d._key);
    setExpandedKeys(new Set(keys));
  }


  const handleCollapseAll = () => {
    setAccordionNonce(n => n + 1);
    setExpandedKeys(new Set());
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

  const getStatusClass = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'IN_PROGRESS') return 'status-in-progress';
    if (s === 'COMPLETED') return 'status-completed';
    if (s === 'NOT_TRIGGERED') return 'status-not-triggered';
    return 'status-error';
  };

  const sortedDevices = useMemo(() => {
    return [...props.devices].sort((a, b) => ((b.elevation ?? -Infinity) - (a.elevation ?? -Infinity)));
  }, [props.devices]);

  return (
      <div>
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
                              {/* Device + selection */}
                              <span className="device-col name">
                                <span
                                  style={{display: "inline-flex", alignItems: "center", marginRight: 8}}
                                  onClick={e => e.stopPropagation()}>
                                  {selectTemplate({item: {data: {_key: device._key}}})}
                                </span>
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
                                    columns={VALIDATION_FAILURE_COLUMNS}
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
}
export default DeviceAccordion;
