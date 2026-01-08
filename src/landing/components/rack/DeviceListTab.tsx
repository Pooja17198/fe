import { h } from "preact";
import { useEffect, useState, useMemo, useRef } from "preact/hooks";
import "ojs/ojtable";
import "ojs/ojprogress-circle";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

type DeviceDTO = {
    deviceName: string;
    jobStatus: string;
    _key: string;
};

type Props = {
    deviceStatuses: DeviceDTO[];
    loading: boolean;
    error: string | null;
    selectedLinkKeys: Set<string>;
    setSelectedLinkKeys: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
};

const DEVICE_COLUMNS = [
    { headerText: "", field: "deviceName", id: "select", template: "selectTemplate", resizable: "disabled" as const, sortable: 'disabled' as const },
    { headerText: "Device Name", field: "deviceName", id: "deviceName", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Validation Status", field: "jobStatus", id: "jobStatus", template: "jobStatusTemplate", resizable: "enabled" as const, sortable: 'enabled' as const }
];

const DeviceListTab = ({ deviceStatuses, loading, error, selectedLinkKeys, setSelectedLinkKeys }: Props) => {
    const dataProvider = useMemo(
        () => new ArrayDataProvider(deviceStatuses, { keyAttributes: "_key" }),
        [deviceStatuses, selectedLinkKeys]
    );

    // This mimics ValidationResultsTab's checkbox column logic.
    const selectTemplate = (context: any) => {
        const row = (context?.item && context.item.data) || {};
        const key = row._key;
        const isChecked = selectedLinkKeys.has(key);
        const onChange = (e: any) => {
            const checked = (e.target as HTMLInputElement).checked;
            setSelectedLinkKeys((prev) => {
                const next = new Set(prev as Set<string>);
                if (checked) next.add(key);
                else next.delete(key);
                return next;
            });
        };
        return <input type="checkbox" checked={isChecked} onChange={onChange} />;
    };

    const jobStatusTemplate = (context: any) => {
        const row = (context?.item && context.item.data) || {};
        const value: string = (row.jobStatus || '').toString().toUpperCase();
        let colorClass = '';
        if (value === 'COMPLETED') {
            colorClass = 'oj-text-color-success';
        } else if (
            value === 'FAILED' || value === 'DEVICE_UNREACHABLE') {
            colorClass = 'oj-text-color-danger';
        }

        // For IN_PROGRESS, show a spinner and label
        if (value === 'IN_PROGRESS') {
            return (
                <span class="centered-cell">
                    <oj-progress-circle size="sm" value={-1}/>
                </span>
            );
        }

        // Default rendering for other statuses
        return <span class={colorClass}>{row.jobStatus}</span>;
    }



    return (
        <div>
            <h3>List of Devices</h3>
            {loading && <div>Loading devices...</div>}
            {error && <div style={{ color: "red" }}>Error: {error}</div>}
            {!loading && !error && deviceStatuses.length === 0 && (
                <div>No devices found for this rack.</div>
            )}
            {!loading && !error && deviceStatuses.length > 0 && (
                <oj-table
                    display="grid"
                    horizontal-grid-visible="enabled"
                    vertical-grid-visible="enabled"
                    layout="contents"
                    aria-label="Device List"
                    columns={DEVICE_COLUMNS}
                    data={dataProvider}
                >
                    <template slot="selectTemplate" render={selectTemplate}/>
                    <template slot="jobStatusTemplate" render={jobStatusTemplate}/>
                </oj-table>
            )}
        </div>
    );
};

export default DeviceListTab;
