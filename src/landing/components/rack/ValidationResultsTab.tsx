import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import "ojs/ojtable";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

type Props = {
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
    hideUnsupported: boolean;
    setHideUnsupported: (v: boolean) => void;
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

const VALIDATION_FAILURE_COLUMNS = [
    { headerText: "", field: "deviceAName", id: "select", template: "selectTemplate", resizable: "disabled" as const, sortable: 'disabled' as const },
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

const ValidationResultsTab = (props: Props) => {
    const ACC = { rowHeader: "ActionItems" };

    // Filtering and processing
    const filteredValidationFailures = useMemo(
        () => !props.hideUnsupported
            ? props.validationFailures
            : props.validationFailures.filter(row =>
                String(row.lldpStatus).toUpperCase() !== 'UNSUPPORTED'
            ),
        [props.validationFailures, props.hideUnsupported]
    );

    const processedValidationFailures = useMemo(
        () =>
            filteredValidationFailures.map(row => ({
                ...row,
                _key: `${row.deviceAName}|||${row.deviceAPort}`
            })),
        [filteredValidationFailures]
    );

    const validationFailuresDataProvider = useMemo(
        () =>
            new ArrayDataProvider(
                processedValidationFailures,
                { keyAttributes: "_key" }
            ),
        [processedValidationFailures]
    );

    const showRackValidationFailure = () => props.rackValidationFailure;

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

    return (
        <div>
            {showRackValidationFailure() === "error" && (
                <div className="oj-flex">
                    <div className="oj-flex-item rack-panel">
                        <h3>Error</h3>
                        <span className="oj-text-color-danger">Failed to load validation failures. Please try again later.</span>
                    </div>
                </div>
            )}
            {!props.hasValidated && showRackValidationFailure() === "no_failures" &&  (
                <div className="oj-flex">
                    <div className="oj-flex-item rack-panel">
                        <h3>Please validate the rack by clicking on the validate button above.</h3>
                        <span>Run validation to view the latest diagnostics and export results.</span>
                    </div>
                </div>
            )}
            {props.hasValidated && showRackValidationFailure() === "no_failures" && (
                <div className="oj-flex">
                    <div className="oj-flex-item rack-panel">
                        <h3>No Issues Found</h3>
                        <span className="oj-text-color-success">No validation failures found for this rack.</span>
                    </div>
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <label style={{ margin: '8px 0', padding: '8px' }}>
                    <input
                        type="checkbox"
                        checked={props.hideUnsupported}
                        onChange={e => props.setHideUnsupported((e.target as HTMLInputElement).checked)}
                        style={{ marginRight: '8px' }}
                    />
                    Hide "UNSUPPORTED" LLDP Status errors
                </label>
            </div>
            {showRackValidationFailure() === "kiev_validation" && processedValidationFailures.length > 0 && (
                <div className="oj-flex">
                    <div className="oj-flex-item rack-panel table-wrapper-full">
                        <h3>Link Action Items</h3>
                        <span className="h4Style oj-text-color-danger">The following links need to be checked and replaced.</span>
                        <br />
                        <oj-table
                            class="selectable-table table-full"
                            display="grid"
                            horizontal-grid-visible="enabled"
                            layout = "contents"
                            vertical-grid-visible="enabled"
                            aria-label="Validation Failure Action Items"
                            id="ValidationFailureItemsTable"
                            accessibility={ACC}
                            scroll-policy="loadMoreOnScroll"
                            scroll-policy-options='{"fetchSize": 10}'
                            columns={VALIDATION_FAILURE_COLUMNS}
                            data={validationFailuresDataProvider}
                        >
                            <template slot="selectTemplate" render={selectTemplate} />
                            <template slot="lldpTemplate" render={lldpTemplate} />
                            <template slot="psuTemplate" render={psuTemplate} />
                        </oj-table>
                    </div>
                </div>
            )}
            <br />
            * When Action Items are completed, Click the Resolve button at the top of the page to resolve the corresponding Jira ticket.
        </div>
    );
};

export default ValidationResultsTab;
