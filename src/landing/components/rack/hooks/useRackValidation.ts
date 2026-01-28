import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { DeviceStatus, JobErrorDetails, RackProps, ValidationFailure } from "../types";
import { LVV_API, POLLING } from "../constants";
import { fetchWithRetry, createCsrfHeaders } from "../api";
import { anyJobInProgress, parseContentDispositionFilename } from "../utils";

type UseRackValidationResult = {
    // state
    deviceStatuses: DeviceStatus[];
    devicesLoading: boolean;
    validationFailures: ValidationFailure[];
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
    const [validationFailures, setValidationFailures] = useState<ValidationFailure[]>([]);
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
    },[]);


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
            const data: ValidationFailure[] = await resp.json();
            if (data && data.length > 0) {
                setValidationFailures(data);
            } else {
                setValidationFailures([]);
            }
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

    return {
        deviceStatuses,
        devicesLoading,
        validationFailures,
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
