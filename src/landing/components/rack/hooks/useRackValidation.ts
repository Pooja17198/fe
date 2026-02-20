import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
    DeviceStatus,
    DeviceValidationFailures,
    FanFailureRow,
    FecBerFailureRow,
    InterfaceFailureRow,
    JobErrorDetails,
    LldpFailureRow,
    OpticFailureRow,
    PowerFailureRow,
    RackProps,
    ValidationFailure,
    ValidationFailuresByDevice,
} from "../types";
import { LVV_API, POLLING } from "../constants";
import { fetchWithRetry, createCsrfHeaders } from "../api";
import { anyJobInProgress, parseContentDispositionFilename } from "../utils";

type UseRackValidationResult = {
    // state
    deviceStatuses: DeviceStatus[];
    devicesLoading: boolean;
    validationFailuresByDevice: ValidationFailuresByDevice;
    totalFailureRows: number;
    totalLinkFailureRows: number;
    powerFailureDevices: number;
    selectedLinkKeys: Set<string>;
    isValidating: boolean;
    jobErrorDetails: JobErrorDetails;
    isDownloading: boolean;

    // derived
    resolveAllowed: boolean;
    resolveTooltip: string;

    // actions
    setSelectedLinkKeys: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    validate: () => Promise<void>;
    resolve: () => Promise<void>;
    downloadCsv: () => Promise<void>;
};

export function useRackValidation(props: RackProps): UseRackValidationResult {
    // refs for lifecycle and cross-attempt state
    const previousStatusesRef = useRef<Map<string, string>>(new Map());
    const currentRackKeyRef = useRef<string>("");
    const pageAbortRef = useRef<AbortController | null>(null);

    // core state
    const [deviceStatuses, setDeviceStatuses] = useState<DeviceStatus[]>([]);
    const [devicesLoading, setDevicesLoading] = useState<boolean>(false);
    const [validationFailuresByDevice, setValidationFailuresByDevice] =
        useState<ValidationFailuresByDevice>({});
    const [selectedLinkKeys, setSelectedLinkKeys] = useState<Set<string>>(new Set());
    const [isValidating, setIsValidating] = useState(false);
    const [jobErrorDetails, setJobErrorDetails] = useState<JobErrorDetails>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    // derived
    const resolveAllowed = Boolean(props.resolveEnabled) && Boolean(props.ticket);
    const resolveTooltip = resolveAllowed
        ? ""
        : props.resolveDisabledReason && String(props.resolveDisabledReason).trim() !== ""
            ? String(props.resolveDisabledReason)
            : "No active Jira ticket found for this rack.";

    // Only run effects when rack context is complete (prevents running on Home page)
    const rackContextReady = Boolean(props.region && props.rack_serial && props.rack && props.building);

    // track rack key and always abort any prior in-flight requests before creating a fresh controller
    useEffect(() => {
        if (!rackContextReady) return;

        const nextKey = `${props.region}|${props.rack_serial}|${props.rack}`;

        // Abort previous in-flight requests (from prior state/page), then create a new controller for current page
        if (pageAbortRef.current) {
            pageAbortRef.current.abort();
        }
        currentRackKeyRef.current = nextKey;
        pageAbortRef.current = new AbortController();
    }, [rackContextReady, props.region, props.rack_serial, props.rack]);

    // reset status tracking map on rack context change
    useEffect(() => {
        if (!rackContextReady) return;
        previousStatusesRef.current = new Map();
    }, [rackContextReady]);

    // clear job error banner on rack context changes
    useEffect(() => {
        if (!rackContextReady) return;
        setJobErrorDetails(null);
    }, [rackContextReady]);

    // abort on unmount
    useEffect(() => {
        return () => {
            if (pageAbortRef.current) {
                pageAbortRef.current.abort();
                // Keep the aborted controller so in-flight loops can detect aborted === true
            }
        };
    }, []);

    const fetchDeviceValidationStatuses = useCallback(async (): Promise<boolean> => {
        setDevicesLoading(true);
        try {
            if (!props.rack_serial || !props.region || !props.rack || !props.building) {
                return false;
            }
            const url = new URL(`${LVV_API}/allDevicesInRack`);
            url.searchParams.set("rackSerialNumber", props.rack_serial);
            url.searchParams.set("regionName", props.region);
            url.searchParams.set("rackNumber", props.rack);
            url.searchParams.set("buildingName", props.building);

            const resp = await fetchWithRetry(url.href, {
                method: "GET",
                signal: pageAbortRef.current?.signal as AbortSignal | undefined,
            });
            if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);

            const data: DeviceStatus[] = await resp.json();
            if (data && data.length > 0) {
                setDeviceStatuses(
                    data.map((device) => ({
                        ...device,
                        _key: device.deviceName,
                    }))
                );
                const inProgress = anyJobInProgress(data);
                setIsValidating(inProgress);
                return inProgress;
            } else {
                setDeviceStatuses([]);
                setIsValidating(false);
                return false;
            }
        } finally {
            setDevicesLoading(false);
        }
        return false;
    }, [props.region, props.rack, props.building, props.rack_serial]);

    const fetchValidationFailures = useCallback(async () => {
        try {
            if (!props.rack_serial || !props.region) {
                return;
            }
            const url = new URL(`${LVV_API}/cablingValidation`);
            url.searchParams.set("regionName", props.region);
            url.searchParams.set("rackSerialNumber", props.rack_serial);

            const resp = await fetchWithRetry(url.href, {
                method: "GET",
                signal: pageAbortRef.current?.signal as AbortSignal | undefined,
            });
            if (!resp.ok) {
                return;
            }
            const data: unknown = await resp.json();
            const normalized = normalizeValidationFailuresPayload(data, props.rack_serial);
            setValidationFailuresByDevice(normalized);
        } catch (e: any) {
            if (e?.name === "AbortError") return;
        }
    }, [props.region, props.rack_serial]);

    // initial/sequential load: devices then failures
    // Avoid "cancelled" flag; snapshot rack key and controller at effect start
    // and only proceed to failures if the context hasn't changed and the start signal wasn't aborted.
    useEffect(() => {
        if (!rackContextReady) return;

        const expectedKey = `${props.region}|${props.rack_serial}|${props.rack}`;
        const startSignal = pageAbortRef.current?.signal as AbortSignal | undefined;

        (async () => {
            const inProgress = await fetchDeviceValidationStatuses();

            const sameContext = currentRackKeyRef.current === expectedKey;
            const notAborted = !(startSignal && startSignal.aborted);
            if (sameContext && notAborted) {
                console.log("isValidating (fresh) ", inProgress);
                if (inProgress){
                    console.log("pollValidationJob being executed");
                    await pollValidationJob(createCsrfHeaders());
                } else{
                    console.log("fetchValidationFailures being executed");
                    await fetchValidationFailures();
                }
            }
        })();
    }, [rackContextReady, fetchDeviceValidationStatuses, fetchValidationFailures, props.region, props.rack_serial, props.rack]);

    // POST to start validation job
    const startValidationJob = useCallback(async () => {
        const headers = createCsrfHeaders();
        const url = new URL(`${LVV_API}/cablingValidation`);
        url.searchParams.set("regionName", props.region);
        url.searchParams.set("rackNumber", props.rack);
        url.searchParams.set("rackSerialNumber", props.rack_serial);
        url.searchParams.set("buildingName", props.building);

        if (selectedLinkKeys.size > 0) {
            const deviceNames = new Set(Array.from(selectedLinkKeys).map((key) => key.split("|||")[0]));
            deviceNames.forEach((name) => url.searchParams.append("deviceNames", name));
        }

        const resp = await fetchWithRetry(url.href, {
            method: "POST",
            headers,
            signal: pageAbortRef.current?.signal as AbortSignal | undefined,
        });
        if (!resp.ok) {
            let errMsg = resp.statusText;
            try {
                const contentType = resp.headers.get("content-type") || "";
                let errorJsonOrText: any = null;
                if (contentType.includes("application/json")) {
                    errorJsonOrText = await resp.json();
                    errMsg = (errorJsonOrText && errorJsonOrText.message) || JSON.stringify(errorJsonOrText) || resp.statusText;
                } else {
                    errorJsonOrText = await resp.text();
                    if (errorJsonOrText) errMsg = errorJsonOrText;
                }
            } catch {
                // ignore parse error
            }
            return {error: {code: resp.status, message: errMsg}};
        }
    }, [props.building, selectedLinkKeys, props.rack, props.region, props.rack_serial]);

    // poll validation job and keep UI state in sync
    const pollValidationJob = useCallback(
        async (headers: Headers) => {
            const previousStatuses = previousStatusesRef.current || new Map();
            const expectedKey = currentRackKeyRef.current;
            const startSignal = pageAbortRef.current?.signal as AbortSignal | undefined;

            for (let attempt = 0; attempt < POLLING.MAX_ATTEMPTS; attempt++) {

                const url = new URL(`${LVV_API}/getValidationJobStatus`);
                url.searchParams.set("regionName", props.region);
                url.searchParams.set("rackSerialNumber", props.rack_serial);
                url.searchParams.set("rackNumber", props.rack);
                url.searchParams.set("lastAttempt", attempt === POLLING.MAX_ATTEMPTS - 1 ? "true" : "false");

                let statusResp: any;
                try {
                    statusResp = await fetchWithRetry(url.href, {
                        method: "GET",
                        headers,
                        signal: startSignal as AbortSignal | undefined,
                    });
                } catch (e: any) {
                    if (e?.name === "AbortError") {
                        //If we navigate back to home page, this stops the polling if teh request is in-flight
                        break;
                    }
                    throw e;
                }

                if (statusResp.ok) {
                    const data: DeviceStatus[] = await statusResp.json();

                    let shouldFetchFailures = false;

                    for (const device of data) {
                        const prevStatus = previousStatuses.get(device.deviceName);
                        // Fetch validation failures if a device's job has just completed
                        if (!shouldFetchFailures && prevStatus !== "COMPLETED" && device.jobStatus === "COMPLETED" && typeof prevStatus !== "undefined") {
                            shouldFetchFailures = true;
                            break;
                        }
                    }

                    // update map for next poll
                    data.forEach((device) => {
                        previousStatuses.set(device.deviceName, device.jobStatus);
                    });
                    previousStatusesRef.current = previousStatuses;

                    // update UI state
                    if (data && data.length > 0) {
                        setDeviceStatuses((prev) =>
                            data.map((device) => {
                                const prior = prev.find((d) => d.deviceName === device.deviceName);
                                const merged: DeviceStatus = {...device, _key: device.deviceName};
                                if (typeof device.elevation !== "number" && typeof prior?.elevation === "number") {
                                    merged.elevation = prior.elevation;
                                }
                                return merged;
                            })
                        );

                        const inProgress = anyJobInProgress(data);
                        setIsValidating(inProgress);

                        // If all jobs are completed, we stop polling after fetching failures
                        if (!inProgress) {
                            if (shouldFetchFailures) {
                                await fetchValidationFailures();
                            }
                            return;
                        }
                    } else {
                        setDeviceStatuses([]);
                        setIsValidating(false);
                    }

                    if (shouldFetchFailures) {
                        await fetchValidationFailures();
                    }
                } else {
                    let errMsg = statusResp.statusText;
                    try {
                        const contentType = statusResp.headers.get("content-type") || "";
                        let errorJsonOrText: any = null;
                        if (contentType.includes("application/json")) {
                            errorJsonOrText = await statusResp.json();
                            errMsg = (errorJsonOrText && errorJsonOrText.message) || JSON.stringify(errorJsonOrText) || statusResp.statusText;
                        } else {
                            errorJsonOrText = await statusResp.text();
                            if (errorJsonOrText) errMsg = errorJsonOrText;
                        }
                    } catch {
                        // ignore
                    } finally {
                        if (currentRackKeyRef.current === expectedKey) {
                            setJobErrorDetails({code: statusResp.status, message: errMsg});
                            setIsValidating(false);
                        }
                    }
                    break;
                }

                if (attempt < POLLING.MAX_ATTEMPTS - 1) {
                    await new Promise((res) => setTimeout(res, POLLING.INTERVAL_MS));
                    // If we are waiting for the next poll, and navigate to home page, this stops the polling once the timeout completes
                    if (startSignal?.aborted) {
                        break;
                    }
                }
            }
        },
        [props.region, props.rack_serial, props.rack, fetchValidationFailures]
    );

    const validate = useCallback(async () => {
        setIsValidating(true);
        setJobErrorDetails(null);
        if (!pageAbortRef.current) {
            pageAbortRef.current = new AbortController();
        }
        const headers = createCsrfHeaders();
        let errorOccurred = false;

        try {
            const startResult = await startValidationJob();
            if (startResult && (startResult as any).error) {
                errorOccurred = true;
                setJobErrorDetails((startResult as any).error);
                setIsValidating(false);
                return;
            }
            await pollValidationJob(headers);
        } catch (e: any) {
            if (e?.name === "AbortError") {
                setIsValidating(false);
                return;
            }
            errorOccurred = true;
            setJobErrorDetails({
                message: e?.message ? e.message : "An unknown error occurred during validation.",
            });
            setIsValidating(false);
        } finally {
            if (!errorOccurred) {
                await fetchValidationFailures();
            }
        }
    }, [startValidationJob, pollValidationJob, fetchValidationFailures]);

    const resolve = useCallback(async () => {
        if (!resolveAllowed) {
            alert(resolveTooltip);
            return;
        }
        const really = confirm("Are you sure you want to resolve the AIs for this Rack");
        if (!really) return;

        const headers = createCsrfHeaders();
        const url = new URL(`${LVV_API}/cablingTasks/${props.ticket}/actions/resolveValidationFailureTask`);
        url.searchParams.set("regionName", props.region);
        const request = new Request(url.href, {method: "POST", headers});

        const response = await fetch(request, {signal: pageAbortRef.current?.signal as AbortSignal | undefined});
        if (response.ok) {
            props.onPageChanged({path: ""});
        } else {
            alert(`Delete failed with status ${response.status} : ${response.statusText}`);
        }
    }, [resolveAllowed, resolveTooltip, props.ticket, props.region, props.onPageChanged]);

    const downloadCsv = useCallback(async () => {
        setIsDownloading(true);
        try {
            const url = new URL(`${LVV_API}/downloadCablingValidationResults`);
            url.searchParams.set("rackSerialNumber", props.rack_serial);
            url.searchParams.set("regionName", props.region);
            const headers = new Headers();
            headers.append("Accept", "text/csv");

            const resp = await fetchWithRetry(url.href, {
                method: "GET",
                headers,
                signal: pageAbortRef.current?.signal as AbortSignal | undefined,
            });
            if (!resp.ok) {
                throw new Error(`${resp.status} ${resp.statusText}`);
            }

            const blob = await resp.blob();
            const cd = resp.headers.get("content-disposition") || "";
            const filename = parseContentDispositionFilename(cd, `cabling_validation_${props.rack_serial}.csv`);

            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objectUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(objectUrl);
        } catch (e: any) {
            const message = e?.message ? e.message : "Unknown error";
            alert(`Download failed: ${message}`);
        } finally {
            setIsDownloading(false);
        }
    }, [props.rack_serial, props.region]);

    const summaryStats = useMemo(() => {
        const values = Object.values(validationFailuresByDevice);
        const totalFailureRows = values.reduce((sum, item) => sum + item.counts.overallTotal, 0);
        const totalLinkFailureRows = values.reduce((sum, item) => sum + item.counts.nonPowerTotal, 0);
        const powerFailureDevices = values.filter((item) => item.hasPsuFailure).length;
        return {totalFailureRows, totalLinkFailureRows, powerFailureDevices};
    }, [validationFailuresByDevice]);

    return {
        deviceStatuses,
        devicesLoading,
        validationFailuresByDevice,
        totalFailureRows: summaryStats.totalFailureRows,
        totalLinkFailureRows: summaryStats.totalLinkFailureRows,
        powerFailureDevices: summaryStats.powerFailureDevices,
        selectedLinkKeys,
        isValidating,
        jobErrorDetails,
        isDownloading,

        resolveAllowed,
        resolveTooltip,

        setSelectedLinkKeys,
        validate,
        resolve,
        downloadCsv,
    };
}

type RowRecord = Record<string, unknown>;

function asRecord(value: unknown): RowRecord | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as RowRecord;
    }
    return null;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback: string = "Unknown"): string {
    if (value === null || value === undefined) return fallback;
    const rendered = String(value).trim();
    return rendered === "" ? fallback : rendered;
}

function textOrEmpty(value: unknown): string {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function pick(record: RowRecord, keys: string[], fallback: string = "Unknown"): string {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(record, key)) {
            const value = record[key];
            if (value !== null && value !== undefined && String(value).trim() !== "") {
                return String(value).trim();
            }
        }
    }
    return fallback;
}

function buildEmptyDeviceValidationFailures(deviceName: string): DeviceValidationFailures {
    return {
        deviceName,
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
}

function finalizeCounts(device: DeviceValidationFailures): DeviceValidationFailures {
    const counts = {
        lldp: device.tests.lldp.length,
        optics: device.tests.optics.length,
        interfaces: device.tests.interfaces.length,
        fecBer: device.tests.fecBer.length,
        fans: device.tests.fans.length,
        power: device.tests.power.length,
        nonPowerTotal:
            device.tests.lldp.length +
            device.tests.optics.length +
            device.tests.interfaces.length +
            device.tests.fecBer.length +
            device.tests.fans.length,
        overallTotal:
            device.tests.lldp.length +
            device.tests.optics.length +
            device.tests.interfaces.length +
            device.tests.fecBer.length +
            device.tests.fans.length +
            device.tests.power.length,
    };
    return {
        ...device,
        counts,
        hasPsuFailure: counts.power > 0,
    };
}

function mapLldpRow(raw: unknown, deviceName: string, idx: number): LldpFailureRow {
    const row = asRecord(raw) || {};
    return {
        _key: `${deviceName}|lldp|${idx}|${pick(row, ["Device A Port", "deviceAPort"], "")}`,
        deviceARack: pick(row, ["Device A Rack", "deviceARack"]),
        deviceAName: pick(row, ["Device A Name", "deviceAName"], deviceName),
        deviceAPort: pick(row, ["Device A Port", "deviceAPort"]),
        currentDeviceBRack: pick(row, ["Device B Rack", "Current Device B Rack", "deviceBRack"]),
        currentDeviceBName: pick(row, ["Device B Name", "Current Device B Name", "deviceBName"]),
        currentDeviceBPort: pick(row, ["Device B Port", "Current Device B Port", "deviceBPort"]),
        expectedDeviceBRack: pick(row, ["Expected Device B Rack", "deviceBRackExpected"]),
        expectedDeviceBName: pick(row, ["Expected Device B Name", "deviceBNameExpected"]),
        expectedDeviceBPort: pick(row, ["Expected Device B Port", "deviceBPortExpected"]),
        linkStatus: pick(row, ["LLDP Status", "Link Status", "lldpStatus", "linkStatus"]),
    };
}

function mapOpticRow(raw: unknown, deviceName: string, idx: number): OpticFailureRow {
    const row = asRecord(raw) || {};
    return {
        _key: `${deviceName}|optics|${idx}|${pick(row, ["Device Port", "devicePort"], "")}`,
        deviceName: pick(row, ["Device Name", "deviceName", "Device A Name", "deviceAName"], deviceName),
        devicePort: pick(row, ["Device Port", "devicePort", "Device A Port", "deviceAPort"]),
        txPower: pick(row, ["Tx Power", "TX Power", "txPower"]),
        rxPower: pick(row, ["Rx Power", "RX Power", "rxPower"]),
    };
}

function mapInterfaceRow(raw: unknown, deviceName: string, idx: number): InterfaceFailureRow {
    const row = asRecord(raw) || {};
    return {
        _key: `${deviceName}|interfaces|${idx}|${pick(row, ["Device Port", "devicePort"], "")}`,
        deviceName: pick(row, ["Device Name", "deviceName"], deviceName),
        devicePort: pick(row, ["Device Port", "devicePort"]),
        issue: pick(row, ["Issue", "issue"]),
    };
}

function mapFecBerRow(raw: unknown, deviceName: string, idx: number): FecBerFailureRow {
    const row = asRecord(raw) || {};
    return {
        _key: `${deviceName}|fecber|${idx}|${pick(row, ["Device Port", "devicePort"], "")}`,
        deviceRack: pick(row, ["Device Rack", "deviceRack"]),
        deviceName: pick(row, ["Device Name", "deviceName"], deviceName),
        devicePort: pick(row, ["Device Port", "devicePort"]),
        preFecBer: pick(row, ["PRE_FEC_BER", "preFecBer"]),
        lockStatus: pick(row, ["Lock Status", "lockStatus"]),
        remoteDevice: pick(row, ["Remote Device", "remoteDevice"]),
        remoteInterface: pick(row, ["Remote Interface", "remoteInterface"]),
    };
}

function mapFanRow(raw: unknown, deviceName: string, idx: number): FanFailureRow {
    const row = asRecord(raw) || {};
    return {
        _key: `${deviceName}|fans|${idx}|${pick(row, ["Fan Slot", "fanSlot"], "")}`,
        deviceName: pick(row, ["Device Name", "deviceName"], deviceName),
        fanName: textOrEmpty(row["Fan Name"] ?? row["fanName"]),
        fanSlot: text(row["Fan Slot"] ?? row["fanSlot"]),
        status: text(row["Status"] ?? row["status"]),
    };
}

function mapPowerRow(raw: unknown, deviceName: string, idx: number): PowerFailureRow {
    const row = asRecord(raw) || {};
    return {
        _key: `${deviceName}|power|${idx}`,
        deviceName: pick(row, ["Device A Name", "Device Name", "deviceAName", "deviceName"], deviceName),
    };
}

function normalizeLegacyValidationRows(rows: ValidationFailure[]): ValidationFailuresByDevice {
    const byDevice: ValidationFailuresByDevice = {};

    rows.forEach((row, idx) => {
        const deviceName = text(row.deviceAName, "Unknown");
        if (!byDevice[deviceName]) {
            byDevice[deviceName] = buildEmptyDeviceValidationFailures(deviceName);
        }
        const current = byDevice[deviceName];

        current.tests.lldp.push({
            _key: `${deviceName}|legacy-lldp|${idx}|${textOrEmpty(row.deviceAPort)}`,
            deviceARack: text(row.deviceARack),
            deviceAName: deviceName,
            deviceAPort: text(row.deviceAPort),
            currentDeviceBRack: text(row.deviceBRack),
            currentDeviceBName: text(row.deviceBName),
            currentDeviceBPort: text(row.deviceBPort),
            expectedDeviceBRack: text(row.deviceBRackExpected),
            expectedDeviceBName: text(row.deviceBNameExpected),
            expectedDeviceBPort: text(row.deviceBPortExpected),
            linkStatus: text(row.lldpStatus || row.linkStatus),
        });

        const hasOptics = textOrEmpty(row.txPower) !== "" || textOrEmpty(row.rxPower) !== "";
        if (hasOptics) {
            current.tests.optics.push({
                _key: `${deviceName}|legacy-optics|${idx}|${textOrEmpty(row.deviceAPort)}`,
                deviceName,
                devicePort: text(row.deviceAPort),
                txPower: text(row.txPower),
                rxPower: text(row.rxPower),
            });
        }

        const psuFailure = textOrEmpty(row.psuFailure);
        if (psuFailure !== "" && psuFailure.toLowerCase() !== "null") {
            current.tests.power.push({
                _key: `${deviceName}|legacy-power|${idx}`,
                deviceName,
            });
        }
    });

    Object.keys(byDevice).forEach((deviceName) => {
        byDevice[deviceName] = finalizeCounts(byDevice[deviceName]);
    });

    return byDevice;
}

function normalizeValidationFailuresPayload(
    payload: unknown,
    rackSerial: string
): ValidationFailuresByDevice {
    if (Array.isArray(payload)) {
        return normalizeLegacyValidationRows(payload as ValidationFailure[]);
    }

    const payloadRecord = asRecord(payload);
    if (!payloadRecord) return {};

    let rackNode: unknown = payloadRecord[rackSerial];
    if (!rackNode) {
        const keys = Object.keys(payloadRecord);
        if (keys.length === 1) {
            rackNode = payloadRecord[keys[0]];
        }
    }

    const rackRecord = asRecord(rackNode);
    if (!rackRecord) return {};

    const byDevice: ValidationFailuresByDevice = {};

    Object.entries(rackRecord).forEach(([deviceName, deviceResults]) => {
        const resultsRecord = asRecord(deviceResults);
        if (!resultsRecord) {
            return;
        }

        const current = buildEmptyDeviceValidationFailures(deviceName);
        current.tests.lldp = asArray(resultsRecord["LLDP Errors"]).map((row, idx) =>
            mapLldpRow(row, deviceName, idx)
        );
        current.tests.optics = asArray(resultsRecord["Optic Errors"]).map((row, idx) =>
            mapOpticRow(row, deviceName, idx)
        );
        current.tests.interfaces = asArray(resultsRecord["Interface Errors"]).map((row, idx) =>
            mapInterfaceRow(row, deviceName, idx)
        );
        current.tests.fecBer = asArray(resultsRecord["FEC_BER Errors"]).map((row, idx) =>
            mapFecBerRow(row, deviceName, idx)
        );
        current.tests.fans = asArray(resultsRecord["Fan Errors"]).map((row, idx) =>
            mapFanRow(row, deviceName, idx)
        );
        current.tests.power = asArray(resultsRecord["Power Errors"]).map((row, idx) =>
            mapPowerRow(row, deviceName, idx)
        );

        byDevice[deviceName] = finalizeCounts(current);
    });

    return byDevice;
}