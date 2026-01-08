import { useState, useCallback, useEffect, useRef } from "preact/hooks";
import "oj-c/button";
import DeviceAccordion from "./DeviceAccordion";

type DeviceValidationStatusDTO = {
    deviceName: string;
    jobStatus: string;
    elevation: number;
    _key: string;
};

type Props = {
    onPageChanged: (value: any) => void;
    building: string;
    block: string;
    rack: string;
    ticket: string;
    rack_serial: string;
    region: string;
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
            if (!response.ok && response.status >= 500) {
                throw new Error(`Server error: ${response.status}`);
            }
            return response;
        } catch (err) {
            lastError = err;
            if (attempt < maxAttempts - 1) {
                await new Promise(res => setTimeout(res, delayMs));
            }
        }
    }
    throw lastError;
}

const TABS = [
    { name: "Validation results", key: "validation" },
    { name: "List of Devices", key: "devices" }
];

const Rack = (props: Props) => {
    const isFirstRender = useRef(true);
    const [validationFailures, setValidationFailures] = useState<ValidationFailureDisplayDTO[]>([]);
    const [selectedLinkKeys, setSelectedLinkKeys] = useState<Set<string>>(new Set());
    const [isValidating, setIsValidating] = useState(false);
    const [jobErrorDetails, setJobErrorDetails] = useState<{ code?: number; message?: string } | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [hasValidated, setHasValidated] = useState(false);
    const [rackValidationFailure, setRackValidationFailure] = useState<string | null>(null);
    const previousStatusesRef = useRef<Map<string, string>>(new Map());
    const [hideUnsupported, setHideUnsupported] = useState(true);
    const [externalExpandedKeys, setExternalExpandedKeys] = useState<Set<string>>(new Set());
    const [externalExpandedKeysNonce, setExternalExpandedKeysNonce] = useState(0);

    // Device state and fetching (lifted from DeviceListTab)
    const [deviceStatuses, setDeviceStatuses] = useState<DeviceValidationStatusDTO[]>([]);
    const [devicesLoading, setDevicesLoading] = useState<boolean>(false);
    const [devicesError, setDevicesError] = useState<string | null>(null);

    // When region changes, go to home page (except on initial mount)
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        props.onPageChanged({path: "home"});
    }, [props.region]);

    // Fetch all the devices in the selected rack and their validation status
    const fetchDeviceValidationStatuses = useCallback(async () => {
        setDevicesLoading(true);
        setDevicesError(null);
        try {
            const url = new URL(`${LVV_API}/allDevicesInRack`);
            url.searchParams.set("rackSerialNumber", props.rack_serial);
            url.searchParams.set("regionName", props.region);
            url.searchParams.set("rackNumber", props.rack);
            url.searchParams.set("buildingName", props.building);
            const resp = await fetchWithRetry(url.href, {method: "GET"});
            if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
            const data: DeviceValidationStatusDTO[] = await resp.json();
            if (data && data.length > 0) {
                // Ensure every device has a unique _key
                setDeviceStatuses(
                    data.map((device) => ({
                        ...device,
                        _key: device.deviceName,
                    }))
                );
            } else {
                setDeviceStatuses([]);
            }
        } finally {
            setDevicesLoading(false);
        }
        }, [props.region, props.rack, props.building]);

    // Fetch Validation Failures
    const fetchValidationFailures = useCallback(async () => {
        try {
            const url = new URL(`${LVV_API}/cablingValidation`);
            url.searchParams.set("regionName", props.region);
            url.searchParams.set("rackSerialNumber", props.rack_serial);
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
    }, [props.region, props.rack_serial]);


    // On loading of the page, we first fetch all the device validation status, and then fetch latest validation failures
    useEffect(() => {
        fetchDeviceValidationStatuses();
        fetchValidationFailures();
    }, [fetchDeviceValidationStatuses, fetchValidationFailures]);

    // Keep link selection in sync
    useEffect(() => {
        setSelectedLinkKeys(prevKeys => {
            const currentKeys = new Set(
                validationFailures.map(
                    row => `${row.deviceAName}|||${row.deviceAPort}`
                )
            );
            return new Set([...prevKeys].filter(key => currentKeys.has(key)));
        });
    }, [validationFailures]);

    // Helper to POST and start validation job
    const startValidationJob = useCallback(async () => {
        console.log("Starting validation job");
        const headers = new Headers();
        headers.append("X-OCI-Splat-CSRF", "1");
        const url = new URL(`${LVV_API}/cablingValidation`);
        url.searchParams.set("regionName", props.region);
        url.searchParams.set("rackNumber", props.rack);
        url.searchParams.set("rackSerialNumber", props.rack_serial);
        url.searchParams.set("buildingName", props.building);
        if (selectedLinkKeys.size > 0) {
            const deviceNames = new Set(
                Array.from(selectedLinkKeys).map((key) => key.split("|||")[0])
            );
            deviceNames.forEach((name) => url.searchParams.append("deviceNames", name));
        }
        const resp = await fetchWithRetry(url.href, {method: "POST", headers});
        if (!resp.ok) {
            let errMsg = resp.statusText;
            try {
                const contentType = resp.headers.get("content-type") || "";
                let errorJsonOrText = null;
                if (contentType.includes("application/json")) {
                    errorJsonOrText = await resp.json();
                    errMsg =
                        (errorJsonOrText && errorJsonOrText.message) ||
                        JSON.stringify(errorJsonOrText) ||
                        resp.statusText;
                } else {
                    errorJsonOrText = await resp.text();
                    if (errorJsonOrText) errMsg = errorJsonOrText;
                }
            } catch (parseError) {
            }
            return {error: {code: resp.status, message: errMsg}};
        }
    }, [
        props.building,
        selectedLinkKeys,
        props.rack,
        props.region
    ]);

    function anyJobInProgress(data: DeviceValidationStatusDTO[]): boolean {
        return data.some((item) => item.jobStatus.includes("IN_PROGRESS"));
    }



    // Helper to poll job status
    const pollValidationJob = useCallback(
        async (headers: Headers) => {
            console.log("Starting to poll");
            const MAX_ATTEMPTS = 40;
            const POLL_INTERVAL_MS = 30000;
            const previousStatuses = previousStatusesRef.current || new Map();

            for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                let lastAttempt = "false";
                if (attempt == MAX_ATTEMPTS - 1) {
                    lastAttempt = "true";
                }
                const url = new URL(`${LVV_API}/getValidationJobStatus`);
                url.searchParams.set("regionName", props.region);
                url.searchParams.set("rackSerialNumber", props.rack_serial);
                url.searchParams.set("rackNumber", props.rack);
                url.searchParams.set("lastAttempt", lastAttempt);

                const statusResp = await fetchWithRetry(url.href, { method: "GET", headers });
                if (statusResp.ok) {
                    const data: DeviceValidationStatusDTO[] = await statusResp.json();

                    // Check for transitions to 'COMPLETED'
                    let shouldFetchFailures = false;
                    for (const device of data) {
                        const prevStatus = previousStatuses.get(device.deviceName);
                        if (
                            prevStatus !== "COMPLETED" && // Was not COMPLETED before...
                            device.jobStatus === "COMPLETED" && // ...but now is
                            typeof prevStatus !== "undefined"    // ...and device already existed
                        ) {
                            shouldFetchFailures = true;
                            break;
                        }
                    }

                    // Update tracked statuses for next poll
                    data.forEach((device) => {
                        previousStatuses.set(device.deviceName, device.jobStatus);
                    });
                    previousStatusesRef.current = previousStatuses;

                    // Update UI state
                    if (data && data.length > 0) {
                        setDeviceStatuses(
                            data.map((device) => ({
                                ...device,
                                _key: device.deviceName,
                            }))
                        );
                        // If none are "IN_PROGRESS", stop polling
                        if (!anyJobInProgress(data)) {
                            if (shouldFetchFailures) {
                                await fetchValidationFailures();
                            }
                            return;
                        }
                    } else {
                        setDeviceStatuses([]);
                    }

                    if (shouldFetchFailures) {
                        await fetchValidationFailures();
                    }
                } else {
                    let errMsg = statusResp.statusText;
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
                    } finally {
                        setJobErrorDetails({ code: statusResp.status, message: errMsg });
                        setRackValidationFailure("error");
                    }
                    break;
                }
                if (attempt < MAX_ATTEMPTS - 1) {
                    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
                }
            }
        },
        [props.region, props.rack_serial, props.rack, fetchValidationFailures]
    );

    // Button handlers
    const validateClicked = useCallback(async () => {
        setIsValidating(true);
        const headers = new Headers();
        headers.append("X-OCI-Splat-CSRF", "1");
        let errorOccurred = false;
        try {
            // 1. Start job
            await startValidationJob();
            // 2. Poll job
            await pollValidationJob(headers);
        } catch (e: any) {
            errorOccurred = true;
            setJobErrorDetails({
                message: (e && e.message) ? e.message : "An unknown error occurred during validation."
            });
        } finally {
            setHasValidated(true);
            if (!errorOccurred) {
                await fetchValidationFailures();
            }
            setIsValidating(false);
        }}, [props.building,
        selectedLinkKeys,
        fetchValidationFailures,
        props.rack,
        props.region,
        startValidationJob,
        pollValidationJob
    ]);


    const resolveClicked = useCallback(async () => {
        const really = confirm("Are you sure you want to resolve the AIs for this Rack");
        if (!really) return;
        const headers = new Headers();
        headers.append("X-OCI-Splat-CSRF", "1");

        const url = new URL(`${CABLING_TASKS_API}/${props.ticket}/actions/resolveValidationFailureTask`);
        url.searchParams.set("regionName", props.region);
        const request = new Request(url.href, {method: "POST", headers});

        const response = await fetch(request);
        if (response.ok) {
            props.onPageChanged({path: ""});
        } else {
            alert(`Delete failed with status ${response.status} : ${response.statusText}`);
        }
    }, [props.ticket, props.region, props.onPageChanged]);


    const downloadCsvClicked = useCallback(async () => {
        setIsDownloading(true);
        try {
            const url = new URL(`${LVV_API}/downloadCablingValidationResults`);
            url.searchParams.set("rackSerialNumber", props.rack_serial);
            url.searchParams.set("regionName", props.region);
            const headers = new Headers();
            headers.append("Accept", "text/csv");
            const resp = await fetchWithRetry(url.href, {method: "GET", headers});
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
            } catch {
            }
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
    }, [props.rack_serial, props.region]);

    // Expand/Collapse all controls for device accordion
    const handleExpandAll = useCallback(() => {
        const filteredFailures = hideUnsupported
            ? validationFailures.filter(row => String(row.lldpStatus).toUpperCase() !== 'UNSUPPORTED')
            : validationFailures;
        const deviceNamesWithFailures = new Set(filteredFailures.map(row => row.deviceAName));
        const keys = deviceStatuses
            .filter(device => deviceNamesWithFailures.has(device.deviceName))
            .map(d => d._key);
        setExternalExpandedKeys(new Set(keys));
        setExternalExpandedKeysNonce(n => n + 1);
    }, [hideUnsupported, validationFailures, deviceStatuses]);

    const handleCollapseAll = useCallback(() => {
        setExternalExpandedKeys(new Set());
        setExternalExpandedKeysNonce(n => n + 1);
    }, []);

    // Tab bar and main render
    return (
        <div class="rack-page">
            <div class="rack-title-box">
                <span
                    role="img"
                    className="oj-icon rack-img-icon"
                    title="Rack Image"
                    alt="Rack Image">
                </span>
                <h2 class="rack-title-headline">
                    <span className="rack-title-key">Building:</span>
                    <span className="rack-title-value">{props.building}</span>
                    <span className="rack-title-key">Block:</span>
                    <span className="rack-title-value">{props.block}</span>
                    <span className="rack-title-key">Rack:</span>
                    <span className="rack-title-value">{props.rack}</span>
                    <span className="rack-title-key">Serial:</span>
                    <span className="rack-title-value">{props.rack_serial}</span>
                </h2>
            </div>


            {isValidating && (
                <div className="alert alert-warning" aria-live="polite" role="status">
                    <span className="alert-icon" aria-hidden="true">⏳</span>
                    Validation in progress...
                </div>
            )}
            {jobErrorDetails && (
                <div className="alert alert-danger" role="alert">
                    <span className="alert-icon" aria-hidden="true">⚠️</span>
                    <div>Validation failed!</div>
                    {jobErrorDetails.code && <div><b>Code:</b> {jobErrorDetails.code}</div>}
                    {jobErrorDetails.message && <div><b>Message:</b> {jobErrorDetails.message}</div>}
                </div>
            )}
            {/* Device accordion summary */}
            <div style={{margin: "18px 0 32px 0"}}>

                <div className="device-accordion-toolbar">

                    {/*Title*/}
                    <h3 className="device-accordion-summary-title">
                  <span
                      role="img"
                      className="oj-icon validation-summary-icon"
                      title="Validation Summary Image"
                      alt="Validation Summary Image">
                  </span>
                        Validation Summary
                    </h3>

                    <div className="flex-spacer"/>

                    {/* Primary actions */}
                    <oj-c-button
                        chroming="callToAction"
                        size="sm"
                        label="Validate"
                        onojAction={validateClicked}
                        style="margin-left: 8px; margin-right: 8px;"
                        disabled={isValidating || deviceStatuses.length === 0}
                    ></oj-c-button>
                    <oj-c-button
                        chroming="callToAction"
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
                        disabled={isValidating || !!isDownloading || validationFailures.length === 0}
                    ></oj-c-button>

                    {/*Unsupported errors checkbox*/}
                    <label>
                        <input
                            type="checkbox"
                            checked={hideUnsupported}
                            onChange={e => setHideUnsupported((e.target as HTMLInputElement).checked)}
                        />
                        Hide Unsupported LLDP errors
                    </label>

                    {/*Expand All/Collapse All button*/}
                    <oj-c-button chroming="outlined" label="✚" tooltip="Expand All" onojAction={handleExpandAll}
                                 size="sm"
                                 class="action-btn"></oj-c-button>
                    <oj-c-button chroming="outlined" label="－" tooltip="Collapse All" onojAction={handleCollapseAll}
                                 size="sm" class="action-btn"></oj-c-button>
                </div>

                <DeviceAccordion
                    devices={deviceStatuses}
                    building={props.building}
                    block={props.block}
                    rack={props.rack}
                    rack_serial={props.rack_serial}
                    region={props.region}
                    validationFailures={validationFailures}
                    selectedLinkKeys={selectedLinkKeys}
                    setSelectedLinkKeys={setSelectedLinkKeys}
                    hasValidated={hasValidated}
                    rackValidationFailure={rackValidationFailure}
                    loading={devicesLoading}
                    isValidating={isValidating}
                    hideUnsupported={hideUnsupported}
                    externalExpandedKeys={externalExpandedKeys}
                    externalExpandedKeysNonce={externalExpandedKeysNonce}
                />

            </div>
        </div>
    );
}


export default Rack;
