import { h } from "preact";
import { useEffect, useCallback, useState, useMemo } from "preact/hooks";
import "ojs/ojtable";
import "oj-c/button";
import ArrayDataProvider = require("ojs/ojarraydataprovider");

type Props = {
    onPageChanged: (value: any) => void;
    building: string;
    block: string;
    rack: string;
    ticket: string;
    rack_serial: string;
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
    _key?: string; // composite key prop for ojs/ojarraydataprovider
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

const CABLING_TASKS_API = window.location.host.includes("localhost")
    ? "http://localhost:21000/lvv/cablingTasks"
    : `https://${window.location.host}/lvv/cablingTasks`;
const LVV_API = window.location.host.includes("localhost")
    ? "http://localhost:21000/lvv"
    : `https://${window.location.host}/lvv`;

async function fetchWithRetry(url: string, options: any = {}, maxAttempts: number = 3, delayMs: number = 1000): Promise<Response> {
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const response = await fetch(url, options);
            // Retry for network errors or 5xx; accept 404, 400, etc. as non-retryable (customize as needed)
            if (!response.ok && response.status >= 500) {
                throw new Error(`Server error: ${response.status}`);
            }
            return response; // Success!
        } catch (err) {
            lastError = err;
            if (attempt < maxAttempts - 1) {
                await new Promise(res => setTimeout(res, delayMs));
            }
        }
    }
    throw lastError;
}

const Rack = (props: Props) => {
    const ACC = { rowHeader: "ActionItems" };
    const [rackValidationFailure, setRackValidationFailure] = useState<string | null>(null);
    const [validationFailures, setValidationFailures] = useState<ValidationFailureDisplayDTO[]>([]);
    const [selectedLinkKeys, setSelectedLinkKeys] = useState<Set<string>>(new Set());
    const [isValidating, setIsValidating] = useState(false);
    const [jobErrorDetails, setJobErrorDetails] = useState<{ code?: number; message?: string } | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [hasValidated, setHasValidated] = useState(false);
    const [hideUnsupported, setHideUnsupported] = useState(true);

    // 1. Filter out unsupported LLDP Status rows
    const filteredValidationFailures = useMemo(
        () => !hideUnsupported
            ? validationFailures
            : validationFailures.filter(row =>
                String(row.lldpStatus).toUpperCase() !== 'UNSUPPORTED'
            ),
        [validationFailures, hideUnsupported]
    );

    // 2. Add _key to every row so oj-table uses a unique key
    const processedValidationFailures = useMemo(
        () =>
            filteredValidationFailures.map(row => ({
                ...row,
                _key: `${row.deviceAName}|||${row.deviceAPort}`
            })),
        [filteredValidationFailures]
    );

    // 3. Use useMemo to prevent re-creating data provider on every render
    const validationFailuresDataProvider = useMemo(
        () =>
            new ArrayDataProvider(
                processedValidationFailures,
                { keyAttributes: "_key" }
            ),
        [processedValidationFailures]
    );

    const resolveClicked = async () => {
        const really = confirm("Are you sure you want to resolve the AIs for this Rack");
        if (!really) return;
        const headers = new Headers();
        headers.append("X-OCI-Splat-CSRF", "1");
        const request = new Request(
            `${CABLING_TASKS_API}/${props.ticket}/actions/resolveValidationFailureTask`,
            { method: "POST", headers }
        );
        const response = await fetch(request);
        if (response.ok) {
            props.onPageChanged({ path: "" });
        } else {
            alert(`Delete failed with status ${response.status} : ${response.statusText}`);
        }
    };
    const downloadCsvClicked = useCallback(async () => {
        setIsDownloading(true);
        try {
            const url = new URL(`${LVV_API}/downloadCablingValidationResults`);
            url.searchParams.set("rackSerial", props.rack_serial);
            const headers = new Headers();
            headers.append("Accept", "text/csv");
            const resp = await fetchWithRetry(url.href, { method: "GET", headers });
            if (!resp.ok) {
                throw new Error(`${resp.status} ${resp.statusText}`);
            }
            const blob = await resp.blob();
            const cd = resp.headers.get("content-disposition") || "";
            let filename = `cabling_validation_${props.rack_serial}.csv`;
            try {
                const match = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
                if (match) {
                    filename = decodeURIComponent((match[1] || match[2]).trim());
                }
            } catch {}
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objectUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(objectUrl);
        } catch (e: any) {
            const message = e && e.message ? e.message : "Unknown error";
            alert(`Download failed: ${message}`);
        } finally {
            setIsDownloading(false);
        }
    }, [props.rack_serial]);

    const fetchValidationFailures = useCallback(async () => {
        try {
            const url = new URL(`${LVV_API}/cablingValidation`);
            url.searchParams.set("rackSerial", props.rack_serial);
            const resp = await fetchWithRetry(url.href);
            if (!resp.ok) {
                setRackValidationFailure("error");
                return;
            }
            const data: ValidationFailureDisplayDTO[] = await resp.json();
            if (data && data.length > 0) {
                setValidationFailures(data);
                setRackValidationFailure("kiev_validation");
            } else {
                setValidationFailures([]);
                setRackValidationFailure("no_failures");
            }
        } catch {
            setRackValidationFailure("error");
        }
    }, [props.rack_serial]);

    const validateClicked = useCallback(async () => {
        setIsValidating(true);
        setJobErrorDetails(null);
        let jobId = null;
        let jobStatus = null;
        try {
            // 1. Post to backend to start job, get jobId
            const headers = new Headers();
            headers.append("X-OCI-Splat-CSRF", "1");
            const url = new URL(`${LVV_API}/cablingValidation`);
            url.searchParams.set("building", props.building);
            url.searchParams.set("rackSerialNumber", props.rack_serial);
            if (selectedLinkKeys.size > 0) {
                const deviceNames = new Set(
                    Array.from(selectedLinkKeys).map((key) => key.split("|||")[0])
                );
                deviceNames.forEach((name) => url.searchParams.append("deviceNames", name));
            }
            const postResp = await fetchWithRetry(url.href, { method: "POST", headers });
            if (!postResp.ok) {
                let errMsg = postResp.statusText;
                try {
                    const contentType = postResp.headers.get("content-type") || "";
                    let errorJsonOrText = null;
                    if (contentType.includes("application/json")) {
                        errorJsonOrText = await postResp.json();
                        errMsg =
                            (errorJsonOrText && errorJsonOrText.message) ||
                            JSON.stringify(errorJsonOrText) ||
                            postResp.statusText;
                    } else {
                        errorJsonOrText = await postResp.text();
                        if (errorJsonOrText) errMsg = errorJsonOrText;
                    }
                } catch (parseError) {
                    // Ignore and fallback to statusText
                }
                setJobErrorDetails({
                    code: postResp.status,
                    message: errMsg,
                });
                setRackValidationFailure("error");
                return;
            }
            jobId = await postResp.text();

            // 2. Poll the job status endpoint up to max attempts
            const MAX_ATTEMPTS = 40;
            const POLL_INTERVAL_MS = 30000;
            for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                const url = new URL(`${LVV_API}/getValidationJobStatus`);
                url.searchParams.set("jobId", jobId);
                url.searchParams.set("building", props.building);
                url.searchParams.set("rackSerialNumber", props.rack_serial);
                const statusResp = await fetchWithRetry(url.href, { method: "GET", headers });
                if (statusResp.ok) {
                    jobStatus = await statusResp.text();
                    if (jobStatus === "Succeeded") {
                        break;
                    }
                } else {
                    let errMsg = statusResp.statusText;
                    console.log(`Received unexpected response: ${errMsg}`);
                    try {
                        const contentType = statusResp.headers.get("content-type") || "";
                        let errorJsonOrText = null;
                        if (contentType.includes("application/json")) {
                            errorJsonOrText = await statusResp.json();
                            errMsg =
                                (errorJsonOrText && errorJsonOrText.message) ||
                                JSON.stringify(errorJsonOrText) ||
                                statusResp.statusText;
                        } else {
                            errorJsonOrText = await statusResp.text();
                            if (errorJsonOrText) errMsg = errorJsonOrText;
                        }
                    } catch (parseError) {
                        console.log("Caught while parsing err response")
                        // Ignore and fallback to statusText
                    } finally {
                        setRackValidationFailure("error");
                        jobStatus = "Failed";
                        setJobErrorDetails({ code: statusResp.status, message: errMsg });
                        console.log(`Job Status: ${jobStatus}`);
                    }
                    break;
                }
                // Wait before next poll, unless this is the last attempt
                if (attempt < MAX_ATTEMPTS - 1) {
                    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
                }
            }
        } finally {
            // 3. Only move ahead if succeeded
            console.log(`Job Status: ${jobStatus}`);
            if (jobStatus === "Succeeded") {
                setHasValidated(true);
                await fetchValidationFailures();
            } else if (jobStatus === "Pending") {
                setJobErrorDetails({
                    code: 200,
                    message: "Validation Job is taking too long. Please select fewer devices at a time to validate or try again later"
                });
                setRackValidationFailure("error");
            }
            setIsValidating(false);
        }
    }, [
        props.building,
        props.block,
        selectedLinkKeys,
        fetchValidationFailures,
        props.rack_serial
    ]);

    useEffect(() => {
        fetchValidationFailures();
    }, [fetchValidationFailures]);

    useEffect(() => {
        setSelectedLinkKeys((prevKeys) => {
            const currentKeys = new Set(processedValidationFailures.map(
                row => row._key
            ));
            // Remove any key in prevKeys that's not in currentKeys (i.e., not present in the current data)
            return new Set([...prevKeys].filter(key => currentKeys.has(key)));
        });
    }, [processedValidationFailures]);

    const showRackValidationFailure = () => rackValidationFailure;

    const selectTemplate = (context: any) => {
        const row = (context?.item && context.item.data) || {};
        const key = row._key;
        const isChecked = selectedLinkKeys.has(key);
        const onChange = (e: any) => {
            const checked = (e.target as HTMLInputElement).checked;
            setSelectedLinkKeys((prev) => {
                const next = new Set(prev);
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
            <div class="header-center">
                <h2>
                    Building: {props.building}, Block: {props.block}, Rack: {props.rack}, Serial: {props.rack_serial}
                </h2>
                <oj-c-button
                    chroming="callToAction"
                    size="sm"
                    label="Validate"
                    onojAction={validateClicked}
                    style="margin-right: 8px;"
                    disabled={isValidating}
                ></oj-c-button>
                <oj-c-button
                    chroming="callToAction"
                    data-testid="resolve-ai-test"
                    size="sm"
                    label="Resolve"
                    onojAction={resolveClicked}
                    disabled={isValidating}
                ></oj-c-button>
                <oj-c-button
                    chroming="callToAction"
                    size="sm"
                    label="Download CSV"
                    onojAction={downloadCsvClicked}
                    style="margin-left: 8px;"
                    disabled={isValidating || isDownloading || processedValidationFailures.length === 0}
                ></oj-c-button>
            </div>
            {isValidating && (
                <div
                    style={{
                        margin: '12px auto',
                        padding: '12px 20px',
                        border: '1.5px solid #e53935',
                        background: '#fff5f5',
                        color: '#d32f2f',
                        fontWeight: 'bold',
                        fontSize: '1.1rem',
                        borderRadius: '6px',
                        display: 'block',
                        boxShadow: '0 1px 4px rgba(229,57,53,0.09)',
                        textAlign: 'center',
                        width: 'fit-content'
                    }}
                    aria-live="polite"
                    role="status"
                >
                    <span style={{ marginRight: 8 }}>&#8635;</span>
                    Validation in progress...
                </div>
            )}
            {jobErrorDetails && (
                <div
                    style={{
                        margin: '12px auto',
                        padding: '12px 20px',
                        border: '1.5px solid #d32f2f',
                        background: '#fff5f5',
                        color: '#d32f2f',
                        fontWeight: 'bold',
                        fontSize: '1.1rem',
                        borderRadius: '6px',
                        display: 'block',
                        boxShadow: '0 1px 4px rgba(229,57,53,0.09)',
                        textAlign: 'center',
                        width: 'fit-content'
                    }}
                    role="alert"
                >
                    <div>Validation failed!</div>
                    {jobErrorDetails.code && <div><b>Code:</b> {jobErrorDetails.code}</div>}
                    {jobErrorDetails.message && <div><b>Message:</b> {jobErrorDetails.message}</div>}
                </div>
            )}
            {showRackValidationFailure() === "error" && (
                <div className="oj-flex">
                    <div className="oj-flex-item rack-panel">
                        <h3>Error</h3>
                        <span className="oj-text-color-danger">Failed to load validation failures. Please try again later.</span>
                    </div>
                </div>
            )}
            {!hasValidated && showRackValidationFailure() === "no_failures" &&  (
                <div className="oj-flex">
                    <div className="oj-flex-item rack-panel">
                        <h3>Please validate the rack by clicking on the validate button above.</h3>
                        <span>Run validation to view the latest diagnostics and export results.</span>
                    </div>
                </div>
            )}
            {hasValidated && showRackValidationFailure() === "no_failures" && (
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
                        checked={hideUnsupported}
                        onChange={e => setHideUnsupported((e.target as HTMLInputElement).checked)}
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

export default Rack;