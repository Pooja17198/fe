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
    PatchPanelRackRows,
    PatchPanelRow,
    RackProps,
    ValidationFailure,
    ValidationFailuresByDevice,
} from "../types";
import { LVV_API, POLLING } from "../constants";
import { fetchWithRetry, createCsrfHeaders } from "../api";
import { anyJobInProgress, isGpuComputeDevice, isRackValidationAllowed, parseContentDispositionFilename } from "../utils";
import { emitMetric, TELEMETRY_METRICS } from "../../telemetry/api";

type UseRackValidationResult = {
    // state
    deviceStatuses: DeviceStatus[];
    devicesLoading: boolean;
    validationFailuresByDevice: ValidationFailuresByDevice;
    patchPanelRackRows: PatchPanelRackRows;
    totalFailureRows: number;
    totalLinkFailureRows: number;
    powerFailureDevices: number;
    selectedLinkKeys: Set<string>;
    isValidating: boolean;
    jobErrorDetails: JobErrorDetails;
    isDownloading: boolean;

    // derived
    eligibleDeviceNames: Set<string>;
    eligibleDeviceCount: number;
    rackValidationAllowed: boolean;
    rackValidationTooltip: string;
    resolveFeatureEnabled: boolean;
    resolveAllowed: boolean;
    resolveTooltip: string;

    // actions
    setSelectedLinkKeys: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    validate: () => Promise<void>;
    resolve: () => Promise<{ ok: true } | { ok: false; message: string }>;
    downloadCsv: () => Promise<void>;
};

export function useRackValidation(props: RackProps): UseRackValidationResult {
    // refs for lifecycle and cross-attempt state
    const previousStatusesRef = useRef<Map<string, string>>(new Map());
    const currentRackKeyRef = useRef<string>("");
    const pageAbortRef = useRef<AbortController | null>(null);
    const patchPanelRackRowsCacheRef = useRef<Map<string, PatchPanelRow[]>>(new Map());
    const patchPanelPrefetchPromiseRef = useRef<Map<string, Promise<PatchPanelRow[]>>>(new Map());
    const validationMeasurementRef = useRef<null | {
        measurementId: number;
        startedAt: number;
        selectedDeviceCount: number;
        rackKey: string;
    }>(null);
    const emittedValidationMeasurementRef = useRef<number | null>(null);

    // core state
    const [deviceStatuses, setDeviceStatuses] = useState<DeviceStatus[]>([]);
    const [devicesLoading, setDevicesLoading] = useState<boolean>(false);
    const [validationFailuresByDevice, setValidationFailuresByDevice] =
        useState<ValidationFailuresByDevice>({});
    const [patchPanelRackRows, setPatchPanelRackRows] = useState<PatchPanelRackRows>([]);
    const [selectedLinkKeys, setSelectedLinkKeys] = useState<Set<string>>(new Set());
    const [isValidating, setIsValidating] = useState(false);
    const [jobErrorDetails, setJobErrorDetails] = useState<JobErrorDetails>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [completedValidationMeasurement, setCompletedValidationMeasurement] = useState<null | {
        measurementId: number;
        startedAt: number;
        selectedDeviceCount: number;
        rackKey: string;
    }>(null);

    // derived
    const rackValidationAllowed = isRackValidationAllowed(props.isGpuRack, props.rackState);
    const rackValidationTooltip = rackValidationAllowed
        ? ""
        : GPU_RACK_IN_SERVICE_ONLY_REASON;
    const resolveFeatureEnabled = props.resolveEnabled !== false; // default to enabled if undefined
    const resolveAllowed = resolveFeatureEnabled && Boolean(props.ticket);
    const resolveTooltip = !resolveFeatureEnabled
        ? (props.resolveDisabledReason && String(props.resolveDisabledReason).trim() !== ""
            ? String(props.resolveDisabledReason)
            : "Resolve disabled for this region")
        : Boolean(props.ticket)
            ? ""
            : "No open ticket";
    const eligibleDeviceNames = useMemo(
        () => deviceStatuses.filter(isDeviceValidationEligible).map((device) => device.deviceName),
        [deviceStatuses]
    );
    const eligibleDeviceNameSet = useMemo(() => new Set(eligibleDeviceNames), [eligibleDeviceNames]);

    // Only run effects when rack context is complete (prevents running on Home page)
    const rackContextReady = Boolean(props.region && props.rack_serial && props.rack && props.building);

    // Keep selected device keys constrained to validation-eligible devices.
    useEffect(() => {
        setSelectedLinkKeys((prev) => {
            if (!rackValidationAllowed) {
                return prev.size === 0 ? prev : new Set<string>();
            }
            let changed = false;
            const next = new Set<string>();
            prev.forEach((key) => {
                const deviceName = selectedKeyToDeviceName(key);
                if (eligibleDeviceNameSet.has(deviceName)) {
                    next.add(key);
                } else {
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [eligibleDeviceNameSet, rackValidationAllowed]);

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
        validationMeasurementRef.current = null;
        setCompletedValidationMeasurement(null);
    }, [rackContextReady, props.region, props.rack_serial, props.rack]);

    // reset status tracking map on rack context change
    useEffect(() => {
        if (!rackContextReady) return;
        previousStatusesRef.current = new Map();
        patchPanelRackRowsCacheRef.current = new Map();
        patchPanelPrefetchPromiseRef.current = new Map();
        setPatchPanelRackRows([]);
    }, [rackContextReady, props.region, props.rack_serial, props.rack, props.building]);

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
            validationMeasurementRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (isValidating) return;
        if (jobErrorDetails) return;
        if (!completedValidationMeasurement) return;
        if (completedValidationMeasurement.rackKey !== currentRackKeyRef.current) return;
        if (emittedValidationMeasurementRef.current === completedValidationMeasurement.measurementId) return;

        const raf = requestAnimationFrame(() => {
            void emitMetric(TELEMETRY_METRICS.VALIDATION_RESULT_DISPLAY_LATENCY, Date.now() - completedValidationMeasurement.startedAt, {
                region: props.region,
                building: props.building,
                block: props.block,
                project: props.project,
                rackNumber: props.rack,
                rackSerial: props.rack_serial,
                selectedDeviceCount: completedValidationMeasurement.selectedDeviceCount,
            }).catch(() => undefined);
            emittedValidationMeasurementRef.current = completedValidationMeasurement.measurementId;
        });

        return () => cancelAnimationFrame(raf);
    }, [
        isValidating,
        jobErrorDetails,
        completedValidationMeasurement,
        validationFailuresByDevice,
        props.region,
        props.building,
        props.block,
        props.project,
        props.rack,
        props.rack_serial,
    ]);

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

            const data: unknown = await resp.json();
            const normalizedDevices = normalizeDeviceStatusesPayload(data);
            if (normalizedDevices.length > 0) {
                setDeviceStatuses(normalizedDevices);
                const inProgress = anyJobInProgress(
                    normalizedDevices.filter((device) => isDeviceValidationEligible(device))
                );
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

    const prefetchPatchPanelRowsForCurrentRack = useCallback(async (): Promise<PatchPanelRow[]> => {
        if (!props.building || !props.rack || !props.rack_serial || !props.region) {
            return [];
        }

        const rackCacheKey = `${props.region}|${props.rack_serial}|${props.rack}|${props.building}`;
        const cachedRows = patchPanelRackRowsCacheRef.current.get(rackCacheKey);
        if (cachedRows) {
            return cachedRows;
        }

        const inFlightPromise = patchPanelPrefetchPromiseRef.current.get(rackCacheKey);
        if (inFlightPromise) {
            return await inFlightPromise;
        }

        const fetchPromise = fetchPatchPanelRowsByRack(
            props.building,
            props.rack,
            props.rack_serial,
            props.region,
            pageAbortRef.current?.signal as AbortSignal | undefined
        )
            .then((rows) => {
                patchPanelRackRowsCacheRef.current.set(rackCacheKey, rows);
                return rows;
            })
            .finally(() => {
                patchPanelPrefetchPromiseRef.current.delete(rackCacheKey);
            });

        patchPanelPrefetchPromiseRef.current.set(rackCacheKey, fetchPromise);
        return await fetchPromise;
    }, [props.building, props.rack, props.rack_serial, props.region]);

    const fetchValidationFailures = useCallback(async (): Promise<boolean> => {
      try {
        if (!props.rack_serial || !props.region) return false;

        const url = new URL(`${LVV_API}/cablingValidation`);
        url.searchParams.set("regionName", props.region);
        url.searchParams.set("rackSerialNumber", props.rack_serial);

        const resp = await fetchWithRetry(url.href, {
          method: "GET",
          signal: pageAbortRef.current?.signal as AbortSignal | undefined,
        });
        if (!resp.ok) return false;

        const data: unknown = await resp.json();
        const normalized = normalizeValidationFailuresPayload(data, props.rack_serial);
        setValidationFailuresByDevice(normalized);

        const hasErrorRows = Object.values(normalized).some(
          (device) => (device?.counts?.overallTotal || 0) > 0
        );

        if (!hasErrorRows) {
          setPatchPanelRackRows([]);
          return true; // validation call succeeded
        }

        // Patch panel fetch is non-blocking for the main validation response.
        try {
          const rackRows = await prefetchPatchPanelRowsForCurrentRack();
          setPatchPanelRackRows(rackRows);
        } catch (patchPanelError: any) {
          if (patchPanelError?.name !== "AbortError") {
            console.warn("[RackValidation] patchPanel backend call failed", {
              message: patchPanelError?.message || String(patchPanelError),
            });
          }
          // Do NOT fail fetchValidationFailures because patch panel is auxiliary.
        }

        return true;
      } catch (e: any) {
        if (e?.name === "AbortError") return false;
        return false; // this is validation API failure path
      }
    }, [props.region, props.rack_serial, prefetchPatchPanelRowsForCurrentRack]);

    // initial/sequential load: devices then failures
    // Avoid "cancelled" flag; snapshot rack key and controller at effect start
    // and only proceed to failures if the context hasn't changed and the start signal wasn't aborted.
    useEffect(() => {
        if (!rackContextReady) return;

        const expectedKey = `${props.region}|${props.rack_serial}|${props.rack}`;
        const startSignal = pageAbortRef.current?.signal as AbortSignal | undefined;

        void (async () => {
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
        })().catch((e: any) => {
            if (e?.name === "AbortError") {
                return;
            }
            setJobErrorDetails({
                message: e?.message ? e.message : "An unknown error occurred during validation polling.",
            });
            setIsValidating(false);
        });
    }, [rackContextReady, fetchDeviceValidationStatuses, fetchValidationFailures, props.region, props.rack_serial, props.rack]);

    // POST to start validation job
    const startValidationJob = useCallback(async () => {
        const headers = createCsrfHeaders();

        if (!rackValidationAllowed) {
            return {
                error: {
                    code: 400,
                    message: GPU_RACK_IN_SERVICE_ONLY_REASON,
                },
            };
        }

        if (eligibleDeviceNames.length === 0) {
            return {
                error: {
                    code: 400,
                    message:
                        "No monitored and deployed devices are available in this rack. Validation can run only on monitored and deployed devices.",
                },
            };
        }

        const isSelectedValidation = selectedLinkKeys.size > 0;
        const requestedDeviceNames = new Set<string>();
        if (selectedLinkKeys.size > 0) {
            Array.from(selectedLinkKeys).forEach((key) => {
                const deviceName = selectedKeyToDeviceName(key);
                if (eligibleDeviceNameSet.has(deviceName)) {
                    requestedDeviceNames.add(deviceName);
                }
            });
        }
        if (requestedDeviceNames.size === 0) {
            eligibleDeviceNames.forEach((name) => requestedDeviceNames.add(name));
        }

        const buildValidationUrl = (
            deviceNames?: Iterable<string>,
            isGpuHostRequest: boolean = false,
            validateWholeGpuRack: boolean = false
        ): URL => {
            const requestUrl = new URL(`${LVV_API}/cablingValidation`);
            requestUrl.searchParams.set("regionName", props.region);
            requestUrl.searchParams.set("rackNumber", props.rack);
            requestUrl.searchParams.set("rackSerialNumber", props.rack_serial);
            requestUrl.searchParams.set("buildingName", props.building);
            if (isGpuHostRequest) {
                requestUrl.searchParams.set("isGPURack", "true");
            }
            if (validateWholeGpuRack) {
                requestUrl.searchParams.set("validateWholeGPURack", "true");
            }
            if (deviceNames) {
                for (const deviceName of deviceNames) {
                    requestUrl.searchParams.append("deviceNames", deviceName);
                }
            }
            return requestUrl;
        };

        const runValidationRequest = async (requestUrl: URL) => {
            const resp = await fetchWithRetry(requestUrl.href, {
                method: "POST",
                headers,
                signal: pageAbortRef.current?.signal as AbortSignal | undefined,
            });
            if (!resp.ok) {
                let errMsg = resp.statusText;
                try {
                    const contentType = resp.headers.get("content-type") || "";
                    if (contentType.includes("application/json")) {
                        const errorJson = await resp.json();
                        errMsg = (errorJson && errorJson.message) || JSON.stringify(errorJson) || resp.statusText;
                    } else {
                        const errorText = await resp.text();
                        if (errorText) errMsg = errorText;
                    }
                } catch {
                    // ignore parse error
                }
                return {error: {code: resp.status, message: errMsg}};
            }
            return null;
        };

        if (props.isGpuRack === true) {
            const isGpuHostDevice = (deviceName: string): boolean =>
                isGpuComputeDevice(deviceName, props.isGpuRack);

            const utilityDeviceNames = Array.from(requestedDeviceNames).filter(
                (deviceName) => !isGpuHostDevice(deviceName)
            );
            const eligibleGpuHostDeviceNames = eligibleDeviceNames.filter((deviceName) =>
                isGpuHostDevice(deviceName)
            );
            const gpuHostDeviceNames = Array.from(requestedDeviceNames).filter((deviceName) =>
                isGpuHostDevice(deviceName)
            );

            const shouldRunGpuHostFlow = gpuHostDeviceNames.length > 0;
            const isWholeGpuRackValidation =
                eligibleGpuHostDeviceNames.length > 0 &&
                eligibleGpuHostDeviceNames.every((deviceName) => requestedDeviceNames.has(deviceName));

            const requestUrls: URL[] = [];
            if (utilityDeviceNames.length > 0) {
                requestUrls.push(buildValidationUrl(utilityDeviceNames));
            }
            if (shouldRunGpuHostFlow) {
                requestUrls.push(buildValidationUrl(gpuHostDeviceNames, true, isWholeGpuRackValidation));
            }

            const results = await Promise.all(requestUrls.map((requestUrl) => runValidationRequest(requestUrl)));
            const firstFailure = results.find((result) => result && (result as any).error);
            if (firstFailure) {
                return firstFailure;
            }
            return;
        }

        const defaultValidationUrl = buildValidationUrl(requestedDeviceNames);
        return await runValidationRequest(defaultValidationUrl) || undefined;
    }, [
        props.building,
        props.isGpuRack,
        selectedLinkKeys,
        props.rack,
        props.region,
        props.rack_serial,
        eligibleDeviceNames,
        eligibleDeviceNameSet,
        rackValidationAllowed,
    ]);

    // poll validation job and keep UI state in sync
    const pollValidationJob = useCallback(
        async (headers: Headers): Promise<boolean> => {
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
                        return false;
                    }
                    throw e;
                }

                if (statusResp.ok) {
                    const data: unknown = await statusResp.json();
                    const polledStatuses = normalizeDeviceStatusesPayload(data);

                     let shouldFetchFailures = false;
                     for (const device of polledStatuses) {
                         const prevStatus = previousStatuses.get(device.deviceName);
                         // Fetch validation failures if a device's job has just completed
                         if (!shouldFetchFailures && prevStatus !== "COMPLETED" && device.jobStatus === "COMPLETED" ) {
                            shouldFetchFailures = true;
                            break;
                         }
                     }

                    // update map for next poll
                    polledStatuses.forEach((device) => {
                        previousStatuses.set(device.deviceName, device.jobStatus);
                    });
                    previousStatusesRef.current = previousStatuses;

                    // update UI state
                    if (polledStatuses.length > 0) {
                        const polledByName = new Set(polledStatuses.map((device) => device.deviceName));

                        setDeviceStatuses((prev) => {
                            const mergedByName = new Map(prev.map((device) => [device.deviceName, device]));

                            polledStatuses.forEach((device) => {
                                const prior = mergedByName.get(device.deviceName);
                                mergedByName.set(device.deviceName, {
                                    ...prior,
                                    ...device,
                                    elevation:
                                        typeof device.elevation === "number"
                                            ? device.elevation
                                            : typeof prior?.elevation === "number"
                                                ? prior.elevation
                                                : undefined,
                                    validationEligible:
                                        typeof prior?.validationEligible === "boolean"
                                            ? prior.validationEligible
                                            : device.validationEligible,
                                    validationEligibilityReason:
                                        prior?.validationEligibilityReason ?? device.validationEligibilityReason,
                                    _key: device.deviceName,
                                });
                            });

                            // Preserve devices not returned by polling endpoint, but mark as non-eligible.
                            if (prev.length > polledStatuses.length) {
                                prev.forEach((device) => {
                                    if (!polledByName.has(device.deviceName)) {
                                        const prior = mergedByName.get(device.deviceName) || device;
                                        if (prior.validationEligible !== false) {
                                            mergedByName.set(device.deviceName, {
                                                ...prior,
                                                validationEligible: false,
                                                validationEligibilityReason: MONITORED_DEPLOYED_ONLY_REASON,
                                            });
                                        }
                                    }
                                });
                            }

                            return Array.from(mergedByName.values());
                        });

                        const inProgress = anyJobInProgress(
                            polledStatuses.filter((device) => isDeviceValidationEligible(device))
                        );
                        setIsValidating(inProgress);

                        // If all jobs are completed, always refresh failures before stopping.
                        // This avoids stale/empty UI when returning to the page and the previous
                        // status map has been reset.
                        if (!inProgress) {
                            return await fetchValidationFailures();
                        }
                    } else {
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
                    return false;
                }

                if (attempt < POLLING.MAX_ATTEMPTS - 1) {
                    await new Promise((res) => setTimeout(res, POLLING.INTERVAL_MS));
                    // If we are waiting for the next poll, and navigate to home page, this stops the polling once the timeout completes
                    if (startSignal?.aborted) {
                        return false;
                    }
                }
            }

            return false;
        },
        [props.region, props.rack_serial, props.rack, fetchValidationFailures]
    );

    const validate = useCallback(async () => {
        if (!rackValidationAllowed) {
            setJobErrorDetails({
                code: 400,
                message: GPU_RACK_IN_SERVICE_ONLY_REASON,
            });
            setIsValidating(false);
            return;
        }
        setPatchPanelRackRows([]);
        // Prefetch patch panel rows in parallel with validation polling so matrix can render sooner.
        void prefetchPatchPanelRowsForCurrentRack().catch((patchPanelError: any) => {
            if (patchPanelError?.name !== "AbortError") {
                console.warn("[RackValidation] patchPanel prefetch failed", {
                    message: patchPanelError?.message || String(patchPanelError),
                });
            }
        });
        const selectedDeviceCount = selectedLinkKeys.size > 0
            ? Array.from(selectedLinkKeys).filter((key) => eligibleDeviceNameSet.has(selectedKeyToDeviceName(key))).length
            : eligibleDeviceNames.length;
        const measurement = {
            measurementId: Date.now() + Math.floor(Math.random() * 1000),
            startedAt: Date.now(),
            selectedDeviceCount,
            rackKey: currentRackKeyRef.current,
        };
        validationMeasurementRef.current = measurement;
        setCompletedValidationMeasurement(null);
        setIsValidating(true);
        setJobErrorDetails(null);
        if (!pageAbortRef.current) {
            pageAbortRef.current = new AbortController();
        }
        const headers = createCsrfHeaders();

        try {
            const startResult = await startValidationJob();
            if (startResult && (startResult as any).error) {
                validationMeasurementRef.current = null;
                setJobErrorDetails((startResult as any).error);
                setIsValidating(false);
                return;
            }
            const completed = await pollValidationJob(headers);
            if (
                completed &&
                validationMeasurementRef.current &&
                validationMeasurementRef.current.rackKey === currentRackKeyRef.current
            ) {
                setCompletedValidationMeasurement(validationMeasurementRef.current);
            }
        } catch (e: any) {
            if (e?.name === "AbortError") {
                validationMeasurementRef.current = null;
                setIsValidating(false);
                return;
            }
            validationMeasurementRef.current = null;
            setJobErrorDetails({
                message: e?.message ? e.message : "An unknown error occurred during validation.",
            });
            setIsValidating(false);
        }
    }, [
        startValidationJob,
        pollValidationJob,
        fetchValidationFailures,
        prefetchPatchPanelRowsForCurrentRack,
        selectedLinkKeys,
        eligibleDeviceNameSet,
        eligibleDeviceNames,
        rackValidationAllowed
    ]);

    const resolve = useCallback(async (): Promise<{ ok: true } | { ok: false; message: string }> => {
        if (!resolveAllowed) {
            return { ok: false, message: resolveTooltip };
        }
        const really = confirm("Are you sure you want to resolve the AIs for this Rack");
        if (!really) return { ok: false, message: "Cancelled" };

        const headers = createCsrfHeaders();
        const url = new URL(`${LVV_API}/cablingTasks/${props.ticket}/actions/resolveValidationFailureTask`);
        url.searchParams.set("regionName", props.region);
        const request = new Request(url.href, {method: "POST", headers});

        const response = await fetch(request, {signal: pageAbortRef.current?.signal as AbortSignal | undefined});
        if (response.ok) {
            props.onPageChanged({path: ""});
            return { ok: true };
        } else {
            let errMsg = response.statusText;
            try {
                const ct = response.headers.get("content-type") || "";
                if (ct.includes("application/json")) {
                    const j = await response.json();
                    errMsg = (j && (j.message || j.error || JSON.stringify(j))) || errMsg;
                } else {
                    const t = await response.text();
                    if (t) errMsg = t;
                }
            } catch {
                // ignore parse errors
            }
            return { ok: false, message: errMsg };
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
        patchPanelRackRows,
        totalFailureRows: summaryStats.totalFailureRows,
        totalLinkFailureRows: summaryStats.totalLinkFailureRows,
        powerFailureDevices: summaryStats.powerFailureDevices,
        selectedLinkKeys,
        isValidating,
        jobErrorDetails,
        isDownloading,

        eligibleDeviceNames: eligibleDeviceNameSet,
        eligibleDeviceCount: eligibleDeviceNames.length,
        rackValidationAllowed,
        rackValidationTooltip,
        resolveFeatureEnabled,
        resolveAllowed,
        resolveTooltip,

        setSelectedLinkKeys,
        validate,
        resolve,
        downloadCsv,
    };
}

type RowRecord = Record<string, unknown>;
const MONITORED_DEPLOYED_ONLY_REASON =
    "Device is not in monitored and deployed state.";
const GPU_RACK_IN_SERVICE_ONLY_REASON =
    "Validation is allowed for GPU racks only when rack state is IN-SERVICE.";

function asRecord(value: unknown): RowRecord | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as RowRecord;
    }
    return null;
}

function selectedKeyToDeviceName(key: string): string {
    return String(key || "").split("|||")[0];
}

function isDeviceValidationEligible(device: DeviceStatus): boolean {
    return device.validationEligible !== false;
}

function normalizeDeviceStatusesPayload(payload: unknown): DeviceStatus[] {
    const rows = asArray(payload);
    const devicesByName = new Map<string, DeviceStatus>();

    rows.forEach((item) => {
        const record = asRecord(item);
        if (!record) return;

        const deviceName = pick(record, ["deviceName", "name", "device_name"], "");
        if (!deviceName) return;

        const prior = devicesByName.get(deviceName);
        const statusValue = pick(record, ["jobStatus", "status", "validationStatus"], "NOT_TRIGGERED");
        const elevation = toInteger(record["elevation"] ?? record["slot"]);
        const eligibility = inferValidationEligibility(record);

        devicesByName.set(deviceName, {
            deviceName,
            jobStatus: statusValue || prior?.jobStatus || "NOT_TRIGGERED",
            elevation:
                typeof elevation === "number"
                    ? elevation
                    : typeof prior?.elevation === "number"
                        ? prior.elevation
                        : undefined,
            validationEligible:
                typeof eligibility.eligible === "boolean"
                    ? eligibility.eligible
                    : prior?.validationEligible,
            validationEligibilityReason: eligibility.reason || prior?.validationEligibilityReason,
            _key: deviceName,
        });
    });

    return Array.from(devicesByName.values());
}

function inferValidationEligibility(record: RowRecord): { eligible: boolean; reason?: string } {
    const explicitEligibility = firstBoolean([
        record["validationEligible"],
        record["isValidationEligible"],
        record["canValidate"],
        record["canRunValidation"],
        record["validatable"],
        record["isValidatable"],
        record["eligibleForValidation"],
        record["validationSupported"],
    ]);
    if (explicitEligibility !== null) {
        return explicitEligibility
            ? { eligible: true }
            : { eligible: false, reason: MONITORED_DEPLOYED_ONLY_REASON };
    }

    const monitored = inferMonitored(record);
    const deployed = inferDeployed(record);

    if (monitored !== null && deployed !== null) {
        return monitored && deployed
            ? { eligible: true }
            : { eligible: false, reason: MONITORED_DEPLOYED_ONLY_REASON };
    }
    if (monitored !== null) {
        return monitored
            ? { eligible: true }
            : { eligible: false, reason: MONITORED_DEPLOYED_ONLY_REASON };
    }
    if (deployed !== null) {
        return deployed
            ? { eligible: true }
            : { eligible: false, reason: MONITORED_DEPLOYED_ONLY_REASON };
    }

    // If API does not expose monitored/deployed hints, keep backward-compatible behavior.
    return { eligible: true };
}

function inferMonitored(record: RowRecord): boolean | null {
    const explicit = firstBoolean([
        record["isMonitored"],
        record["monitored"],
        record["monitoringEnabled"],
        record["isMonitoringEnabled"],
    ]);
    if (explicit !== null) return explicit;

    const configAttributes = asRecord(record["configAttributes"]);
    if (configAttributes) {
        if (Object.prototype.hasOwnProperty.call(configAttributes, "monitoring.interfaces")) {
            return toPresenceFlag(configAttributes["monitoring.interfaces"]) ?? false;
        }
    }

    const monitoringInterfaces = readRecordPath(record, ["monitoring", "interfaces"]);
    const monitoringInterfacesDirect = record["monitoringInterfaces"];
    const monitorByPresence = toPresenceFlag(monitoringInterfaces);
    if (monitorByPresence !== null) return monitorByPresence;
    const monitorByPresenceDirect = toPresenceFlag(monitoringInterfacesDirect);
    if (monitorByPresenceDirect !== null) return monitorByPresenceDirect;

    return null;
}

function inferDeployed(record: RowRecord): boolean | null {
    const explicit = firstBoolean([record["isDeployed"], record["deployed"]]);
    if (explicit !== null) return explicit;

    const stateCandidates = [
        record["deviceState"],
        record["state"],
        record["deploymentState"],
        record["lifecycleState"],
        readRecordPath(record, ["state", "conf", "device.state"]),
        readRecordPath(record, ["state", "device.state"]),
        readRecordPath(record, ["conf", "device.state"]),
    ];

    const normalizedState = firstString(stateCandidates);
    if (!normalizedState) return null;

    return normalizedState.toLowerCase() === "deployed";
}

function readRecordPath(record: RowRecord, path: string[]): unknown {
    let current: unknown = record;
    for (const key of path) {
        const currentRecord = asRecord(current);
        if (!currentRecord || !Object.prototype.hasOwnProperty.call(currentRecord, key)) {
            return undefined;
        }
        current = currentRecord[key];
    }
    return current;
}

function firstBoolean(values: unknown[]): boolean | null {
    for (const value of values) {
        const parsed = toBoolean(value);
        if (parsed !== null) return parsed;
    }
    return null;
}

function firstString(values: unknown[]): string | null {
    for (const value of values) {
        if (value === null || value === undefined) continue;
        if (typeof value === "string" && value.trim() !== "") {
            return value.trim();
        }
    }
    return null;
}

function toBoolean(value: unknown): boolean | null {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
        if (value === 1) return true;
        if (value === 0) return false;
    }
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "yes", "y", "1", "enabled"].includes(normalized)) return true;
        if (["false", "no", "n", "0", "disabled"].includes(normalized)) return false;
    }
    return null;
}

function toPresenceFlag(value: unknown): boolean | null {
    const parsedBoolean = toBoolean(value);
    if (parsedBoolean !== null) return parsedBoolean;
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return true;
    if (typeof value === "string") return value.trim() !== "";
    if (value === null || value === undefined) return null;
    return null;
}

function toInteger(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const parsed = Number.parseInt(value.trim(), 10);
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
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
        deviceALocation: pick(row, ["Device A Location", "deviceALocation"]),
        currentDeviceBRack: pick(row, ["Device B Rack", "Current Device B Rack", "deviceBRack"]),
        currentDeviceBName: pick(row, ["Device B Name", "Current Device B Name", "deviceBName"]),
        currentDeviceBPort: pick(row, ["Device B Port", "Current Device B Port", "deviceBPort"]),
        currentBLocation: pick(
            row,
            ["Current B Location", "currentBLocation"]
        ),
        expectedDeviceBRack: pick(row, ["Expected Device B Rack", "deviceBRackExpected"]),
        expectedDeviceBName: pick(row, ["Expected Device B Name", "deviceBNameExpected"]),
        expectedDeviceBPort: pick(row, ["Expected Device B Port", "deviceBPortExpected"]),
        expectedBLocation: pick(
            row,
            ["Expected B Location", "expectedBLocation"]
        ),
        linkStatus: pick(row, ["LLDP Status", "Link Status", "lldpStatus", "linkStatus"]),
        errorMessage: textOrEmpty(row["Error Message"] ?? row["errorMessage"]),
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
        sourceDeviceName: pick(row, ["Source Device Name", "sourceDeviceName"], deviceName),
        sourceDevicePort: pick(row, ["Source Device Port", "sourceDevicePort"]),
        sourceDeviceLocation: pick(row, ["Source Device Location", "sourceDeviceLocation"]),
        remoteDeviceName: pick(row, ["Remote Device Name", "remoteDeviceName"]),
        remoteDevicePort: pick(row, ["Remote Device Port", "remoteDevicePort"]),
        errorMessage: textOrEmpty(row["Error Message"] ?? row["errorMessage"]),
    };
}

function mapInterfaceRow(raw: unknown, deviceName: string, idx: number): InterfaceFailureRow {
    const row = asRecord(raw) || {};
    return {
        _key: `${deviceName}|interfaces|${idx}|${pick(row, ["Device Port", "devicePort"], "")}`,
        deviceName: pick(row, ["Device Name", "deviceName"], deviceName),
        devicePort: pick(row, ["Device Port", "devicePort"]),
        issue: pick(row, ["Issue", "issue"]),
        sourceDeviceName: pick(row, ["Source Device Name", "sourceDeviceName"], deviceName),
        sourceDevicePort: pick(row, ["Source Device Port", "sourceDevicePort"]),
        sourceDeviceLocation: pick(row, ["Source Device Location", "sourceDeviceLocation"]),
        remoteDeviceName: pick(row, ["Remote Device Name", "remoteDeviceName"]),
        remoteDevicePort: pick(row, ["Remote Device Port", "remoteDevicePort"]),
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
        errorMessage: textOrEmpty(row["Error Message"] ?? row["errorMessage"]),
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
        errorMessage: textOrEmpty(row["Error Message"] ?? row["errorMessage"]),
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
            errorMessage: "",
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
        const lastValidatedValue = resultsRecord["Last Validated"];
        current.lastValidated =
            lastValidatedValue === null || lastValidatedValue === undefined
                ? null
                : String(lastValidatedValue).trim() || null;
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

function normalizeIdeCutsheetRows(payload: unknown): PatchPanelRow[] {
    if (Array.isArray(payload)) {
        return payload.filter((item) => asRecord(item) !== null) as PatchPanelRow[];
    }

    const payloadRecord = asRecord(payload);
    if (!payloadRecord) {
        return [];
    }

    const items = payloadRecord["items"];
    if (Array.isArray(items)) {
        return items.filter((item) => asRecord(item) !== null) as PatchPanelRow[];
    }

    return [];
}

async function fetchPatchPanelRowsByRack(
    buildingName: string | undefined,
    rackNumber: string | undefined,
    rackSerialNumber: string | undefined,
    regionName: string | undefined,
    signal?: AbortSignal
): Promise<PatchPanelRow[]> {
    const patchPanelUrl = new URL(`${LVV_API}/patchPanel`);
    if (buildingName && buildingName.trim() !== "") {
        patchPanelUrl.searchParams.set("buildingName", buildingName);
    }
    if (rackNumber && rackNumber.trim() !== "") {
        patchPanelUrl.searchParams.set("rackNumber", rackNumber);
    }
    if (rackSerialNumber && rackSerialNumber.trim() !== "") {
        patchPanelUrl.searchParams.set("rackSerialNumber", rackSerialNumber);
    }
    if (regionName && regionName.trim() !== "") {
        patchPanelUrl.searchParams.set("regionName", regionName);
    }

    const response = await fetchWithRetry(patchPanelUrl.href, {
        method: "GET",
        signal,
    });
    if (!response.ok) {
        throw new Error(`patchPanel query failed (${response.status} ${response.statusText})`);
    }

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        payload = [];
    }
    return normalizeIdeCutsheetRows(payload);
}