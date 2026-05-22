import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
    DeviceStatus,
    DeviceValidationFailures,
    HostReadinessItem,
    JobErrorDetails,
    PatchPanelByDevicePort,
    PatchPanelRow,
    RackProps,
    RackValidationViewMode,
    ValidationFailuresByDevice,
    ValidationSection,
    ValidationTableRow,
} from "../types";
import { LVV_API, POLLING } from "../constants";
import { fetchWithRetry, createCsrfHeaders } from "../api";
import {
    anyJobInProgress,
    isGpuComputeDevice,
    isRackValidationAllowed,
    parseContentDispositionFilename,
} from "../utils";
import { emitMetric, TELEMETRY_METRICS } from "../../telemetry/api";
import {
    isPeriodicValidationRefreshEnabledForRack,
} from "../../../config/configUtils";
import {
    getLocalRackStubDeviceStatuses,
    getLocalRackStubValidationPayload,
    isLocalRackStubMatch,
} from "../../../localRackStub";
import {
    asArray,
    asRecord,
    chunkArray,
    finalizeCounts,
    getPeriodicRefreshDeviceNames,
    normalizeDeviceStatusesPayload,
    normalizeSectionKey,
    normalizeValidationFailuresPayload,
    VALIDATION_SERVICE_DEVICE_BATCH_SIZE,
} from "../validationShared";

const VALIDATION_SERVICE_REFRESH_INTERVAL_MS = 10_000;

type ValidationServiceDeviceRequest = {
    deviceName: string;
    isGpuDevice: boolean;
};

type ValidationServiceResultsRequestPayload = {
    regionName: string;
    buildingName: string;
    rackSerialNumber: string;
    rackNumber: string;
    devices: ValidationServiceDeviceRequest[];
};

type UseRackValidationResult = {
    // state
    deviceStatuses: DeviceStatus[];
    devicesLoading: boolean;
    validationFailuresByDevice: ValidationFailuresByDevice;
    deviceRefreshTimestampsByName: Record<string, string | null>;
    patchPanelByDevicePort: PatchPanelByDevicePort;
    totalFailureRows: number;
    totalLinkFailureRows: number;
    powerFailureDevices: number;
    selectedLinkKeys: Set<string>;
    isValidating: boolean;
    jobErrorDetails: JobErrorDetails;
    isDownloading: boolean;
    isPeriodicValidationRefreshing: boolean;

    // derived
    eligibleDeviceNames: Set<string>;
    eligibleDeviceCount: number;
    rackValidationAllowed: boolean;
    rackValidationTooltip: string;
    periodicValidationEnabled: boolean;
    periodicValidationDeviceNames: Set<string>;
    periodicValidationDeviceCount: number;
    periodicRefreshIntervalMs: number;
    onDemandValidationDeviceNames: Set<string>;
    onDemandValidationDeviceCount: number;
    resolveFeatureEnabled: boolean;
    resolveAllowed: boolean;
    resolveTooltip: string;

    // actions
    setSelectedLinkKeys: (value: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    validate: () => Promise<void>;
    resolve: () => Promise<{ ok: true } | { ok: false; message: string }>;
    downloadExcel: () => Promise<void>;
    setPeriodicRefreshIntervalMs: (value: number) => void;
    refreshPeriodicValidationResults: (
        deviceNames?: Iterable<string>
    ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

type HostReadinessByName = Record<string, HostReadinessItem>;

type UseRackValidationOptions = {
    viewMode?: RackValidationViewMode;
};

export function useRackValidation(props: RackProps, options?: UseRackValidationOptions): UseRackValidationResult {
    const viewMode: RackValidationViewMode = options?.viewMode || "ncp";
    const validationServiceView = viewMode === "validationService";

    // refs for lifecycle and cross-attempt state
    const previousStatusesRef = useRef<Map<string, string>>(new Map());
    const currentRackKeyRef = useRef<string>("");
    const pageAbortRef = useRef<AbortController | null>(null);
    const validationFailuresByDeviceRef = useRef<ValidationFailuresByDevice>({});
    const patchPanelRowsCacheRef = useRef<Map<string, PatchPanelRow[]>>(new Map());
    const patchPanelPrefetchPromiseRef = useRef<Map<string, Promise<PatchPanelRow[]>>>(new Map());
    const patchPanelLookupKeysRef = useRef<Set<string>>(new Set());
    const periodicValidationRefreshInFlightRef = useRef(false);
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
    const [hostReadinessByName, setHostReadinessByName] = useState<HostReadinessByName>({});
    const [hostReadinessLoading, setHostReadinessLoading] = useState<boolean>(false);
    const [validationFailuresByDevice, setValidationFailuresByDevice] =
        useState<ValidationFailuresByDevice>({});
    const [deviceRefreshTimestampsByName, setDeviceRefreshTimestampsByName] =
        useState<Record<string, string | null>>({});
    const [patchPanelByDevicePort, setPatchPanelByDevicePort] = useState<PatchPanelByDevicePort>({});
    const [selectedLinkKeys, setSelectedLinkKeys] = useState<Set<string>>(new Set());
    const [isValidating, setIsValidating] = useState(false);
    const [jobErrorDetails, setJobErrorDetails] = useState<JobErrorDetails>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isPeriodicValidationRefreshing, setIsPeriodicValidationRefreshing] = useState(false);
    const [periodicRefreshIntervalMs, setPeriodicRefreshIntervalMs] = useState<number>(
        VALIDATION_SERVICE_REFRESH_INTERVAL_MS
    );
    const [completedValidationMeasurement, setCompletedValidationMeasurement] = useState<null | {
        measurementId: number;
        startedAt: number;
        selectedDeviceCount: number;
        rackKey: string;
    }>(null);

    useEffect(() => {
        validationFailuresByDeviceRef.current = validationFailuresByDevice;
    }, [validationFailuresByDevice]);

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
    const validationEligibleDeviceNames = useMemo(
        () => deviceStatuses.filter(isDeviceValidationEligible).map((device) => device.deviceName),
        [deviceStatuses]
    );
    const periodicValidationRefreshEnabled = useMemo(() => {
        if (!validationServiceView) {
            return false;
        }

        const hasBackendValidationModes = deviceStatuses.some(
            (device) => device.validationMode === "ON_DEMAND" || device.validationMode === "STREAMING"
        );

        if (hasBackendValidationModes) {
            return deviceStatuses.some(
                (device) => device.validationMode === "STREAMING" && device.validationEligible !== false
            );
        }

        return isPeriodicValidationRefreshEnabledForRack({
            region: props.region,
            building: props.building,
            block: props.block,
            rackSerial: props.rack_serial,
            isGpuRack: props.isGpuRack,
        });
    }, [
        validationServiceView,
        deviceStatuses,
        props.region,
        props.building,
        props.block,
        props.rack_serial,
        props.isGpuRack,
    ]);
    const periodicRefreshDeviceNames = useMemo(
        () =>
            getPeriodicRefreshDeviceNames(deviceStatuses, {
                periodicValidationRefreshEnabled,
                isGpuRack: props.isGpuRack,
            }),
        [deviceStatuses, periodicValidationRefreshEnabled, props.isGpuRack]
    );
    const periodicValidationDeviceNameSet = useMemo(
        () => new Set(periodicRefreshDeviceNames),
        [periodicRefreshDeviceNames]
    );
    const eligibleDeviceNames = useMemo(
        () => validationEligibleDeviceNames,
        [validationEligibleDeviceNames]
    );
    const eligibleDeviceNameSet = useMemo(() => new Set(eligibleDeviceNames), [eligibleDeviceNames]);
    const onDemandValidationDeviceNames = useMemo(
        () =>
            deviceStatuses
                .filter(
                    (device) =>
                        isDeviceValidationEligible(device) &&
                        device.validationMode === "ON_DEMAND"
                )
                .map((device) => device.deviceName),
        [deviceStatuses]
    );
    const onDemandValidationDeviceNameSet = useMemo(
        () => new Set(onDemandValidationDeviceNames),
        [onDemandValidationDeviceNames]
    );

    // Only run effects when rack context is complete (prevents running on Home page)
    const rackContextReady = Boolean(props.region && props.rack_serial && props.rack && props.building);

    const filterOutPeriodicValidationDevices = useCallback(
        (failuresByDevice: ValidationFailuresByDevice): ValidationFailuresByDevice => {
            if (periodicValidationDeviceNameSet.size === 0) {
                return failuresByDevice;
            }

            let changed = false;
            const filtered: ValidationFailuresByDevice = {};

            Object.entries(failuresByDevice).forEach(([deviceName, deviceFailures]) => {
                if (periodicValidationDeviceNameSet.has(deviceName)) {
                    changed = true;
                    return;
                }

                filtered[deviceName] = deviceFailures;
            });

            return changed ? filtered : failuresByDevice;
        },
        [periodicValidationDeviceNameSet]
    );

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
        validationFailuresByDeviceRef.current = {};
        patchPanelRowsCacheRef.current = new Map();
        patchPanelPrefetchPromiseRef.current = new Map();
        patchPanelLookupKeysRef.current = new Set();
        setValidationFailuresByDevice({});
        setDeviceRefreshTimestampsByName({});
        setPatchPanelByDevicePort({});
    }, [rackContextReady, props.region, props.rack_serial, props.rack, props.building]);

    const refreshRackHostReadiness = useCallback(async (signal?: AbortSignal): Promise<void> => {
        if (!rackContextReady || !props.isGpuRack) {
            setHostReadinessByName({});
            setHostReadinessLoading(false);
            return;
        }

        setHostReadinessLoading(true);
        try {
            const items = await fetchRackHostReadiness(
                props.rack_serial,
                props.region,
                props.building,
                props.block,
                signal
            );

            const nextReadinessByName = items.reduce<Record<string, HostReadinessItem>>((acc, item) => {
                acc[normalizeLookupKey(item.hostName)] = item;
                return acc;
            }, {} as HostReadinessByName);

            setHostReadinessByName(nextReadinessByName);
        } finally {
            setHostReadinessLoading(false);
        }
    }, [rackContextReady, props.isGpuRack, props.rack_serial, props.region]);

    const mergedDeviceStatuses = useMemo(() => {
        return deviceStatuses.map((device) => {
            const readiness = hostReadinessByName[normalizeLookupKey(device.deviceName)];
            const isGpuCompute = isGpuComputeDevice(device.deviceName, props.isGpuRack);

            if (!isGpuCompute) {
                const {
                    hostReadinessLoading: _hostReadinessLoading,
                    hostReadinessStatus,
                    hostSerial,
                    hostInstanceId,
                    hostHopsState,
                    hostComputeState,
                    hostComputePool,
                    hostTicketIds,
                    ...rest
                } = device;
                return rest;
            }

            return {
                ...device,
                hostReadinessLoading: hostReadinessLoading && !readiness,
                hostReadinessStatus: readiness?.status,
                hostSerial: readiness?.hostSerial,
                hostInstanceId: readiness?.instanceId ?? null,
                hostHopsState: readiness?.hopsState,
                hostComputeState: readiness?.computeState,
                hostComputePool: readiness?.computePool,
                hostTicketIds: readiness?.ticketIds ?? [],
            };
        });
    }, [deviceStatuses, hostReadinessByName, hostReadinessLoading, props.isGpuRack]);

    useEffect(() => {
        const signal = pageAbortRef.current?.signal as AbortSignal | undefined;
        let active = true;

        void refreshRackHostReadiness(signal)
            .then(() => {
                if (!active) return;
            })
            .catch((e: any) => {
                if (!active || e?.name === "AbortError") return;
                console.warn("[RackValidation] rackHostCableValidationReadiness query failed", {
                    message: e?.message || String(e),
                    rackSerial: props.rack_serial,
                    region: props.region,
                });
            });

        return () => {
            active = false;
        };
    }, [refreshRackHostReadiness]);

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

    const fetchDeviceValidationStatuses = useCallback(async (): Promise<{
        inProgress: boolean;
        devices: DeviceStatus[];
    }> => {
        setDevicesLoading(true);
        try {
            if (!props.rack_serial || !props.region || !props.rack || !props.building) {
                return { inProgress: false, devices: [] };
            }

            const localStubStatuses = getLocalRackStubDeviceStatuses({
                region: props.region,
                building: props.building,
                rackNumber: props.rack,
                rackSerialNumber: props.rack_serial,
            });
            if (localStubStatuses) {
                setDeviceStatuses(localStubStatuses);
                setIsValidating(false);
                return { inProgress: false, devices: localStubStatuses };
            }

            const url = new URL(`${LVV_API}/allDevicesInRack`);
            url.searchParams.set("rackSerialNumber", props.rack_serial);
            url.searchParams.set("regionName", props.region);
            url.searchParams.set("rackNumber", props.rack);
            url.searchParams.set("buildingName", props.building);
            url.searchParams.set("isGPURack", String(Boolean(props.isGpuRack)));
            url.searchParams.set("rackState", String(props.rackState || ""));

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
                return { inProgress, devices: normalizedDevices };
            } else {
                setDeviceStatuses([]);
                setIsValidating(false);
                return { inProgress: false, devices: [] };
            }
        } finally {
            setDevicesLoading(false);
        }
        return { inProgress: false, devices: [] };
    }, [props.region, props.rack, props.building, props.rack_serial, props.isGpuRack, props.rackState]);

    const prefetchPatchPanelRowsForCurrentRack = useCallback(async (
        options: { forceRefresh?: boolean } = {}
    ): Promise<PatchPanelRow[]> => {
        if (!props.building || !props.rack || !props.rack_serial || !props.region) {
            return [];
        }

        const rackCacheKey = `${props.region}|${props.rack_serial}|${props.rack}|${props.building}`;
        if (!options.forceRefresh) {
            const cachedRows = patchPanelRowsCacheRef.current.get(rackCacheKey);
            if (cachedRows) {
                return cachedRows;
            }

            const inFlightPromise = patchPanelPrefetchPromiseRef.current.get(rackCacheKey);
            if (inFlightPromise) {
                return await inFlightPromise;
            }
        }

        const fetchPromise = fetchPatchPanelRowsByRack(
            props.building,
            props.rack,
            props.rack_serial,
            props.region,
            pageAbortRef.current?.signal as AbortSignal | undefined
        )
            .then((rows) => {
                patchPanelRowsCacheRef.current.set(rackCacheKey, rows);
                return rows;
            })
            .finally(() => {
                patchPanelPrefetchPromiseRef.current.delete(rackCacheKey);
            });

        patchPanelPrefetchPromiseRef.current.set(rackCacheKey, fetchPromise);
        return await fetchPromise;
    }, [props.building, props.rack, props.rack_serial, props.region]);

    const applyPatchPanelRowsForValidationFailures = useCallback(async (
        failuresByDevice: ValidationFailuresByDevice,
        patchPanelRowsPromise?: Promise<PatchPanelRow[]>
    ): Promise<void> => {
        const nextLookupKeys = collectPatchPanelLookupKeysFromFailures(failuresByDevice);
        if (nextLookupKeys.size === 0) {
            patchPanelLookupKeysRef.current = new Set();
            setPatchPanelByDevicePort({});
            if (patchPanelRowsPromise) {
                void patchPanelRowsPromise.catch(() => undefined);
            }
            return;
        }

        const previousLookupKeys = patchPanelLookupKeysRef.current;
        const hasNewLookupKeys = Array.from(nextLookupKeys).some(
            (lookupKey) => !previousLookupKeys.has(lookupKey)
        );

        try {
            const rackRows = patchPanelRowsPromise
                ? await patchPanelRowsPromise
                : await prefetchPatchPanelRowsForCurrentRack({ forceRefresh: hasNewLookupKeys });
            patchPanelLookupKeysRef.current = nextLookupKeys;
            setPatchPanelByDevicePort(indexPatchPanelRowsByDevicePort(rackRows, nextLookupKeys));
        } catch (patchPanelError: any) {
            if (patchPanelError?.name !== "AbortError") {
                console.warn("[RackValidation] patchPanel backend call failed", {
                    message: patchPanelError?.message || String(patchPanelError),
                });
            }
        }
    }, [prefetchPatchPanelRowsForCurrentRack]);

    const fetchValidationFailures = useCallback(async (
      options?: { excludedDeviceNames?: Set<string> }
    ): Promise<boolean> => {
      try {
        if (!props.rack_serial || !props.region) return false;

        if (props.isGpuRack) {
            try {
                await refreshRackHostReadiness(pageAbortRef.current?.signal as AbortSignal | undefined);
            } catch (readinessError: any) {
                if (readinessError?.name === "AbortError") {
                    return false;
                }
                console.warn("[RackValidation] rackHostCableValidationReadiness refresh failed before cablingValidation", {
                    message: readinessError?.message || String(readinessError),
                    rackSerial: props.rack_serial,
                    region: props.region,
                });
            }
        }

        const localStubPayload = getLocalRackStubValidationPayload({
          region: props.region,
          building: props.building,
          rackNumber: props.rack,
          rackSerialNumber: props.rack_serial,
        });
        const excludedDeviceNames = options?.excludedDeviceNames;
        if (localStubPayload) {
          const normalized = normalizeValidationFailuresPayload(localStubPayload, props.rack_serial);
          const manualFailures = excludedDeviceNames
            ? Object.fromEntries(
                Object.entries(normalized).filter(([deviceName]) => !excludedDeviceNames.has(deviceName))
              ) as ValidationFailuresByDevice
            : filterOutPeriodicValidationDevices(normalized);
          validationFailuresByDeviceRef.current = manualFailures;
          setValidationFailuresByDevice(manualFailures);
          setPatchPanelByDevicePort({});
          return true;
        }

        // Start patch panel request early to overlap with cabling validation parsing.
        const patchPanelRowsPromise = prefetchPatchPanelRowsForCurrentRack();

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
        const manualFailures = excludedDeviceNames
          ? Object.fromEntries(
              Object.entries(normalized).filter(([deviceName]) => !excludedDeviceNames.has(deviceName))
            ) as ValidationFailuresByDevice
          : filterOutPeriodicValidationDevices(normalized);
        const mergedFailures = mergeValidationFailuresByDevice(
          validationFailuresByDeviceRef.current,
          manualFailures
        );
        validationFailuresByDeviceRef.current = mergedFailures;
        setValidationFailuresByDevice(mergedFailures);
        setDeviceRefreshTimestampsByName((prev) => mergeDeviceRefreshTimestamps(prev, manualFailures));

        const hasAnyErrors = Object.values(manualFailures).some(
          (device) => (device?.counts?.overallTotal || 0) > 0
        );

        if (!hasAnyErrors) {
          await applyPatchPanelRowsForValidationFailures(manualFailures, patchPanelRowsPromise);
          return true; // validation call succeeded
        }

        // Patch panel fetch is auxiliary; keep failures response successful even if it fails.
        await applyPatchPanelRowsForValidationFailures(manualFailures, patchPanelRowsPromise);

        return true;
      } catch (e: any) {
        if (e?.name === "AbortError") return false;
        return false; // this is validation API failure path
      }
    }, [
        props.region,
        props.rack_serial,
        props.rack,
        props.building,
        props.isGpuRack,
        filterOutPeriodicValidationDevices,
        prefetchPatchPanelRowsForCurrentRack,
        applyPatchPanelRowsForValidationFailures,
        refreshRackHostReadiness,
    ]);

    const refreshValidationServiceResults = useCallback(async (
        deviceNames?: Iterable<string>
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
        if (!rackContextReady) {
            return { ok: false, message: "Rack context is incomplete." };
        }

        const requestedDeviceNames = Array.from(
            new Set(
                Array.from(deviceNames || periodicRefreshDeviceNames)
                    .map((deviceName) => String(deviceName || "").trim())
                    .filter((deviceName) => periodicValidationDeviceNameSet.has(deviceName))
            )
        );

        if (
            requestedDeviceNames.length === 0 ||
            !props.region ||
            !props.building ||
            !props.rack_serial ||
            !props.rack
        ) {
            return {
                ok: false,
                message: "No devices are configured for periodic validation refresh.",
            };
        }

        if (periodicValidationRefreshInFlightRef.current) {
            return { ok: false, message: "Periodic validation refresh is already in progress." };
        }

        periodicValidationRefreshInFlightRef.current = true;
        setIsPeriodicValidationRefreshing(true);
        try {
            const localStubPayload = getLocalRackStubValidationPayload({
                region: props.region,
                building: props.building,
                rackNumber: props.rack,
                rackSerialNumber: props.rack_serial,
            });
            if (localStubPayload) {
                const normalized = normalizeValidationFailuresPayload(localStubPayload, props.rack_serial);
                const responseTimestamp = new Date().toISOString();
                const stampedResults = stampValidationFailuresWithResponseTime(normalized, responseTimestamp);
                setDeviceRefreshTimestampsByName((prev) =>
                    mergeDeviceRefreshTimestamps(prev, stampedResults)
                );

                const mergedFailures = mergePeriodicValidationFailuresByDevice(
                    validationFailuresByDeviceRef.current,
                    normalized
                );
                validationFailuresByDeviceRef.current = mergedFailures;
                setValidationFailuresByDevice(mergedFailures);
                await applyPatchPanelRowsForValidationFailures(mergedFailures);
                return { ok: true };
            }

            const url = new URL(`${LVV_API}/getResultsFromValidationService`);
            const headers = createCsrfHeaders();
            headers.append("Content-Type", "application/json");
            const batchResults = await Promise.all(
                chunkArray(
                    requestedDeviceNames,
                    VALIDATION_SERVICE_DEVICE_BATCH_SIZE
                ).map(async (deviceNameBatch) => {
                    const payload: ValidationServiceResultsRequestPayload = {
                        regionName: props.region,
                        buildingName: props.building,
                        rackSerialNumber: props.rack_serial,
                        rackNumber: props.rack,
                        devices: deviceNameBatch.map((deviceName) => ({
                            deviceName,
                            isGpuDevice: isGpuComputeDevice(deviceName, props.isGpuRack),
                        })),
                    };

                    const resp = await fetchWithRetry(url.href, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(payload),
                        signal: pageAbortRef.current?.signal as AbortSignal | undefined,
                    });
                    if (!resp.ok) {
                        throw new Error(
                            `Periodic refresh failed with status ${resp.status} ${resp.statusText}`
                        );
                    }

                    const data: unknown = await resp.json();
                    return normalizeValidationFailuresPayload(data, props.rack_serial);
                })
            );

            const normalized: ValidationFailuresByDevice = Object.assign({}, ...batchResults);

            if (Object.keys(normalized).length === 0) {
                return {
                    ok: false,
                    message: "Validation service returned no results for the requested devices.",
                };
            }

            const responseTimestamp = new Date().toISOString();
            const stampedResults = stampValidationFailuresWithResponseTime(normalized, responseTimestamp);
            setDeviceRefreshTimestampsByName((prev) =>
                mergeDeviceRefreshTimestamps(prev, stampedResults)
            );

            const mergedFailures = mergePeriodicValidationFailuresByDevice(
                validationFailuresByDeviceRef.current,
                normalized
            );
            validationFailuresByDeviceRef.current = mergedFailures;
            setValidationFailuresByDevice(mergedFailures);
            await applyPatchPanelRowsForValidationFailures(mergedFailures);
            return { ok: true };
        } catch (e: any) {
            if (e?.name !== "AbortError") {
                console.warn("[RackValidation] periodic validation-service refresh failed", {
                    deviceNames: requestedDeviceNames,
                    message: e?.message || String(e),
                });
            }
            return {
                ok: false,
                message:
                    e?.name === "AbortError"
                        ? "Periodic validation refresh was cancelled."
                        : e?.message
                            ? String(e.message)
                            : "Periodic validation refresh failed.",
            };
        } finally {
            periodicValidationRefreshInFlightRef.current = false;
            setIsPeriodicValidationRefreshing(false);
        }
    }, [
        rackContextReady,
        periodicRefreshDeviceNames,
        periodicValidationDeviceNameSet,
        props.region,
        props.building,
        props.rack_serial,
        props.rack,
        props.isGpuRack,
        applyPatchPanelRowsForValidationFailures,
    ]);

    useEffect(() => {
        if (!periodicValidationRefreshEnabled) return;
        if (!rackContextReady) return;
        if (periodicRefreshDeviceNames.length === 0) return;

        const intervalId = window.setInterval(() => {
            void refreshValidationServiceResults();
        }, periodicRefreshIntervalMs);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [
        periodicValidationRefreshEnabled,
        rackContextReady,
        periodicRefreshDeviceNames,
        periodicRefreshIntervalMs,
        refreshValidationServiceResults,
    ]);

    useEffect(() => {
        if (!validationServiceView) return;
        if (!periodicValidationRefreshEnabled) return;
        if (!rackContextReady) return;
        if (periodicRefreshDeviceNames.length === 0) return;

        void refreshValidationServiceResults();
    }, [
        validationServiceView,
        periodicValidationRefreshEnabled,
        rackContextReady,
        periodicRefreshDeviceNames,
        refreshValidationServiceResults,
    ]);

    // initial/sequential load: devices then failures
    // Avoid "cancelled" flag; snapshot rack key and controller at effect start
    // and only proceed to failures if the context hasn't changed and the start signal wasn't aborted.
    useEffect(() => {
        if (!rackContextReady) return;

        const expectedKey = `${props.region}|${props.rack_serial}|${props.rack}`;
        const startSignal = pageAbortRef.current?.signal as AbortSignal | undefined;

        void (async () => {
            const { inProgress, devices } = await fetchDeviceValidationStatuses();

            const sameContext = currentRackKeyRef.current === expectedKey;
            const notAborted = !(startSignal && startSignal.aborted);
            if (sameContext && notAborted) {
                console.log("isValidating (fresh) ", inProgress);
                if (validationServiceView) {
                    const streamingDeviceNames = new Set(
                        devices
                            .filter(
                                (device) =>
                                    isDeviceValidationEligible(device) &&
                                    device.validationMode === "STREAMING"
                            )
                            .map((device) => device.deviceName)
                    );
                    const hasOnDemandDevices = devices.some(
                        (device) =>
                            isDeviceValidationEligible(device) &&
                            device.validationMode === "ON_DEMAND"
                    );
                    if (hasOnDemandDevices) {
                        await fetchValidationFailures({
                            excludedDeviceNames: streamingDeviceNames,
                        });
                    }
                    return;
                }
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
    }, [rackContextReady, fetchDeviceValidationStatuses, props.region, props.rack_serial, props.rack, validationServiceView]);

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
        const validateTargetDeviceNames = validationServiceView
            ? onDemandValidationDeviceNames
            : eligibleDeviceNames;
        const validateTargetDeviceNameSet = validationServiceView
            ? onDemandValidationDeviceNameSet
            : eligibleDeviceNameSet;
        const requestedDeviceNames = new Set<string>();
        if (selectedLinkKeys.size > 0) {
            Array.from(selectedLinkKeys).forEach((key) => {
                const deviceName = selectedKeyToDeviceName(key);
                if (validateTargetDeviceNameSet.has(deviceName)) {
                    requestedDeviceNames.add(deviceName);
                }
            });
        }
        if (requestedDeviceNames.size === 0) {
            validateTargetDeviceNames.forEach((name) => requestedDeviceNames.add(name));
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
                                    validationMode:
                                        device.validationMode ?? prior?.validationMode,
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

        if (validationServiceView && onDemandValidationDeviceNames.length === 0) {
            setJobErrorDetails({
                code: 400,
                message: "No devices on this tab are enabled for on-demand validation.",
            });
            setIsValidating(false);
            return;
        }

        setPatchPanelByDevicePort({});
        const selectedDeviceCount = selectedLinkKeys.size > 0
            ? Array.from(selectedLinkKeys).filter((key) =>
                (validationServiceView ? onDemandValidationDeviceNameSet : eligibleDeviceNameSet)
                    .has(selectedKeyToDeviceName(key))
            ).length
            : (validationServiceView ? onDemandValidationDeviceNames.length : eligibleDeviceNames.length);
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

        if (isLocalRackStubMatch({
            region: props.region,
            building: props.building,
            rackNumber: props.rack,
            rackSerialNumber: props.rack_serial,
        })) {
            const localStubStatuses = getLocalRackStubDeviceStatuses({
                region: props.region,
                building: props.building,
                rackNumber: props.rack,
                rackSerialNumber: props.rack_serial,
            });
            const localStubPayload = getLocalRackStubValidationPayload({
                region: props.region,
                building: props.building,
                rackNumber: props.rack,
                rackSerialNumber: props.rack_serial,
            });

            if (localStubStatuses) {
                setDeviceStatuses(localStubStatuses);
            }
            if (localStubPayload) {
                const manualFailures = filterOutPeriodicValidationDevices(
                    normalizeValidationFailuresPayload(localStubPayload, props.rack_serial)
                );
                validationFailuresByDeviceRef.current = manualFailures;
                setValidationFailuresByDevice(
                    manualFailures
                );
            }
            setIsValidating(false);
            if (validationMeasurementRef.current?.rackKey === currentRackKeyRef.current) {
                setCompletedValidationMeasurement(validationMeasurementRef.current);
            }
            return;
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
            await refreshRackHostReadiness(pageAbortRef.current?.signal as AbortSignal | undefined);
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
        selectedLinkKeys,
        onDemandValidationDeviceNames,
        onDemandValidationDeviceNameSet,
        eligibleDeviceNameSet,
        eligibleDeviceNames,
        rackValidationAllowed,
        filterOutPeriodicValidationDevices,
        props.rack_serial,
        validationServiceView,
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
        const vendorName = String(props.vendorName || "").trim();
        if (vendorName) {
            url.searchParams.set("vendorName", vendorName);
        }
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
    }, [resolveAllowed, resolveTooltip, props.ticket, props.region, props.vendorName, props.onPageChanged]);

    const downloadExcel = useCallback(async () => {
        setIsDownloading(true);
        try {
            const url = new URL(`${LVV_API}/downloadCablingValidationResults`);
            url.searchParams.set("rackSerialNumber", props.rack_serial);
            url.searchParams.set("regionName", props.region);
            url.searchParams.set("format", "xlsx");
            url.searchParams.set("isGPURack", String(Boolean(props.isGpuRack)));
            const headers = new Headers();
            headers.append("Accept", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

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
            const filename = parseContentDispositionFilename(
                cd,
                `cabling_validation_${props.rack_serial}.xlsx`
            );

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
            alert(`Download Excel failed: ${message}`);
        } finally {
            setIsDownloading(false);
        }
    }, [props.rack_serial, props.region, props.isGpuRack]);

    const summaryStats = useMemo(() => {
        const values = Object.values(validationFailuresByDevice);
        const totalFailureRows = values.reduce((sum, item) => sum + item.counts.overallTotal, 0);
        const totalLinkFailureRows = values.reduce((sum, item) => sum + item.counts.nonPowerTotal, 0);
        const powerFailureDevices = values.filter((item) => item.hasPsuFailure).length;
        return {totalFailureRows, totalLinkFailureRows, powerFailureDevices};
    }, [validationFailuresByDevice]);

    return {
        deviceStatuses: mergedDeviceStatuses,
        devicesLoading,
        validationFailuresByDevice,
        deviceRefreshTimestampsByName,
        patchPanelByDevicePort,
        totalFailureRows: summaryStats.totalFailureRows,
        totalLinkFailureRows: summaryStats.totalLinkFailureRows,
        powerFailureDevices: summaryStats.powerFailureDevices,
        selectedLinkKeys,
        isValidating,
        jobErrorDetails,
        isDownloading,
        isPeriodicValidationRefreshing,

        eligibleDeviceNames: eligibleDeviceNameSet,
        eligibleDeviceCount: eligibleDeviceNames.length,
        rackValidationAllowed,
        rackValidationTooltip,
        periodicValidationEnabled: periodicValidationRefreshEnabled,
        periodicValidationDeviceNames: periodicValidationDeviceNameSet,
        periodicValidationDeviceCount: periodicRefreshDeviceNames.length,
        periodicRefreshIntervalMs,
        onDemandValidationDeviceNames: onDemandValidationDeviceNameSet,
        onDemandValidationDeviceCount: onDemandValidationDeviceNames.length,
        resolveFeatureEnabled,
        resolveAllowed,
        resolveTooltip,

        setSelectedLinkKeys,
        validate,
        resolve,
        downloadExcel,
        setPeriodicRefreshIntervalMs,
        refreshPeriodicValidationResults: refreshValidationServiceResults,
    };
}

const MONITORED_DEPLOYED_ONLY_REASON =
    "Device is not in monitored and deployed state.";
const GPU_RACK_IN_SERVICE_ONLY_REASON =
    "Validation is allowed for GPU racks only when rack state is IN-SERVICE.";
const POWER_SECTION_TITLE = "Power Errors";

function normalizeLookupKey(value: string | null | undefined): string {
    return String(value || "").trim().toLowerCase();
}

async function fetchRackHostReadiness(
    rackSerialNumber: string,
    region: string,
    building: string,
    block: string,
    signal?: AbortSignal
): Promise<HostReadinessItem[]> {
    if (!rackSerialNumber || !region) {
        return [];
    }

    const availabilityDomainRegionPrefix =
        region === "us-phoenix-1"
            ? "phx"
            : region === "us-ashburn-1"
                ? "iad"
                : region;
    const availabilityDomains = [1, 2, 3].map(
        (adNumber) => `${availabilityDomainRegionPrefix}-ad-${adNumber}`
    );

    for (const availabilityDomain of availabilityDomains) {
        const readinessUrl = new URL(`${LVV_API}/rackHostCableValidationReadiness`);
        readinessUrl.searchParams.set("rackSerialNumber", rackSerialNumber);
        readinessUrl.searchParams.set("regionName", region);
        readinessUrl.searchParams.set("availabilityDomain", availabilityDomain);
        readinessUrl.searchParams.set("building", building);
        readinessUrl.searchParams.set("block", block);

        const response = await fetchWithRetry(readinessUrl.href, { method: "GET", signal });
        if (!response.ok) {
            continue;
        }

        const body = await response.text();
        if (!body.trim()) {
            continue;
        }

        let payload: unknown;
        try {
            payload = JSON.parse(body);
        } catch {
            continue;
        }

        const record = asRecord(payload);
        const hostReadiness = asArray(record?.["hostReadiness"]);
        if (hostReadiness.length === 0) {
            continue;
        }

        return hostReadiness
            .map((rawItem: unknown) => asRecord(rawItem))
            .filter((item: Record<string, unknown> | null): item is Record<string, unknown> => Boolean(item))
            .map((item: Record<string, unknown>) => ({
                hostSerial: String(item["hostSerial"] ?? item["serialNumber"] ?? ""),
                hostName: String(item["hostName"] ?? item["deviceName"] ?? item["host"] ?? ""),
                instanceId: item["instanceId"] == null ? null : String(item["instanceId"]),
                hopsState: item["hopsState"] == null ? undefined : String(item["hopsState"]),
                computeState: item["computeState"] == null ? undefined : String(item["computeState"]),
                computePool: item["computePool"] == null ? undefined : String(item["computePool"]),
                status: String(item["status"] ?? ""),
                ticketId: item["ticketId"] == null ? null : String(item["ticketId"]),
                ticketIds: asArray(item["ticketIds"]).map((ticket: unknown) => String(ticket)),
            }));
    }

    return [];
}

function selectedKeyToDeviceName(key: string): string {
    return String(key || "").split("|||")[0];
}

function isDeviceValidationEligible(device: DeviceStatus): boolean {
    return device.validationEligible !== false;
}

function areStringArraysEqual(left: string[] | undefined, right: string[] | undefined): boolean {
    const leftValues = left || [];
    const rightValues = right || [];
    if (leftValues.length !== rightValues.length) {
        return false;
    }

    return leftValues.every((value, index) => value === rightValues[index]);
}

function areUnknownValuesEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) {
        return true;
    }

    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }

        return left.every((value, index) => areUnknownValuesEqual(value, right[index]));
    }

    if (
        left &&
        right &&
        typeof left === "object" &&
        typeof right === "object"
    ) {
        const leftRecord = left as Record<string, unknown>;
        const rightRecord = right as Record<string, unknown>;
        const leftKeys = Object.keys(leftRecord).sort();
        const rightKeys = Object.keys(rightRecord).sort();

        if (!areStringArraysEqual(leftKeys, rightKeys)) {
            return false;
        }

        return leftKeys.every((key) => areUnknownValuesEqual(leftRecord[key], rightRecord[key]));
    }

    return false;
}

function areValidationTableRowsEqual(
    leftRows: ValidationTableRow[],
    rightRows: ValidationTableRow[]
): boolean {
    if (leftRows.length !== rightRows.length) {
        return false;
    }

    return leftRows.every((row, index) => areUnknownValuesEqual(row, rightRows[index]));
}

function areValidationSectionsEqual(
    leftSections: Record<string, ValidationSection>,
    rightSections: Record<string, ValidationSection>,
    sectionOrder: string[]
): boolean {
    return sectionOrder.every((sectionKey) => {
        const leftSection = leftSections[sectionKey];
        const rightSection = rightSections[sectionKey];

        if (!leftSection || !rightSection) {
            return leftSection === rightSection;
        }

        return (
            leftSection.key === rightSection.key &&
            leftSection.title === rightSection.title &&
            areValidationTableRowsEqual(leftSection.rows, rightSection.rows)
        );
    });
}

function areCountsEqual(
    leftCounts: DeviceValidationFailures["counts"],
    rightCounts: DeviceValidationFailures["counts"]
): boolean {
    if (
        leftCounts.power !== rightCounts.power ||
        leftCounts.nonPowerTotal !== rightCounts.nonPowerTotal ||
        leftCounts.overallTotal !== rightCounts.overallTotal
    ) {
        return false;
    }

    const leftSectionKeys = Object.keys(leftCounts.bySection).sort();
    const rightSectionKeys = Object.keys(rightCounts.bySection).sort();
    if (!areStringArraysEqual(leftSectionKeys, rightSectionKeys)) {
        return false;
    }

    return leftSectionKeys.every(
        (sectionKey) => leftCounts.bySection[sectionKey] === rightCounts.bySection[sectionKey]
    );
}

function areDeviceValidationFailuresEqual(
    left: DeviceValidationFailures,
    right: DeviceValidationFailures
): boolean {
    return (
        left.deviceName === right.deviceName &&
        left.lastValidated === right.lastValidated &&
        left.reachability === right.reachability &&
        left.hasPsuFailure === right.hasPsuFailure &&
        areStringArraysEqual(left.sectionOrder, right.sectionOrder) &&
        areStringArraysEqual(left.presentSectionKeys, right.presentSectionKeys) &&
        areStringArraysEqual(left.periodicSectionKeys, right.periodicSectionKeys) &&
        areValidationTableRowsEqual(left.powerRows, right.powerRows) &&
        areValidationSectionsEqual(left.sections, right.sections, left.sectionOrder) &&
        areCountsEqual(left.counts, right.counts)
    );
}

function areValidationFailuresByDeviceEqual(
    left: ValidationFailuresByDevice,
    right: ValidationFailuresByDevice
): boolean {
    const leftDeviceNames = Object.keys(left).sort();
    const rightDeviceNames = Object.keys(right).sort();

    if (!areStringArraysEqual(leftDeviceNames, rightDeviceNames)) {
        return false;
    }

    return leftDeviceNames.every((deviceName) => {
        const leftDevice = left[deviceName];
        const rightDevice = right[deviceName];
        return Boolean(leftDevice && rightDevice && areDeviceValidationFailuresEqual(leftDevice, rightDevice));
    });
}

function mergeValidationFailuresByDevice(
    previous: ValidationFailuresByDevice,
    incoming: ValidationFailuresByDevice
): ValidationFailuresByDevice {
    if (Object.keys(incoming).length === 0) {
        return previous;
    }

    const merged: ValidationFailuresByDevice = {
        ...previous,
        ...incoming,
    };
    const powerSectionKey = normalizeSectionKey(POWER_SECTION_TITLE);

    Object.entries(incoming).forEach(([deviceName, incomingDevice]) => {
        const previousDevice = previous[deviceName];
        const periodicSectionKeys = previousDevice?.periodicSectionKeys || [];
        if (!previousDevice || periodicSectionKeys.length === 0) {
            return;
        }

        const nextDevice: DeviceValidationFailures = {
            ...incomingDevice,
            reachability: incomingDevice.reachability ?? previousDevice.reachability ?? null,
            sections: { ...incomingDevice.sections },
            sectionOrder: [...incomingDevice.sectionOrder],
            presentSectionKeys: [...(incomingDevice.presentSectionKeys || [])],
            periodicSectionKeys: [...periodicSectionKeys],
            powerRows: incomingDevice.powerRows,
        };

        periodicSectionKeys.forEach((sectionKey) => {
            if (sectionKey === powerSectionKey) {
                nextDevice.powerRows = previousDevice.powerRows;
                return;
            }

            const periodicSection = previousDevice.sections[sectionKey];
            if (periodicSection) {
                nextDevice.sections[sectionKey] = periodicSection;
                if (!nextDevice.sectionOrder.includes(sectionKey)) {
                    nextDevice.sectionOrder.push(sectionKey);
                }
                return;
            }

            delete nextDevice.sections[sectionKey];
            nextDevice.sectionOrder = nextDevice.sectionOrder.filter(
                (existingSectionKey) => existingSectionKey !== sectionKey
            );
        });

        merged[deviceName] = finalizeCounts(nextDevice);
    });

    return areValidationFailuresByDeviceEqual(previous, merged) ? previous : merged;
}

function mergePeriodicValidationFailuresByDevice(
    previous: ValidationFailuresByDevice,
    incoming: ValidationFailuresByDevice
): ValidationFailuresByDevice {
    if (Object.keys(incoming).length === 0) {
        return previous;
    }

    const merged: ValidationFailuresByDevice = { ...previous };
    const powerSectionKey = normalizeSectionKey(POWER_SECTION_TITLE);

    Object.entries(incoming).forEach(([deviceName, incomingDevice]) => {
        const previousDevice = previous[deviceName];

        if (!previousDevice) {
            merged[deviceName] = finalizeCounts(incomingDevice);
            return;
        }

        const incomingPeriodicSectionKeys = [...(incomingDevice.presentSectionKeys || [])];
        const previousPeriodicSectionKeys = [...(previousDevice.periodicSectionKeys || [])];
        const previousReachability = previousDevice.reachability ?? null;
        const incomingReachability = incomingDevice.reachability ?? previousReachability;
        const periodicSectionsChanged =
            !areStringArraysEqual(previousPeriodicSectionKeys, incomingPeriodicSectionKeys) ||
            incomingPeriodicSectionKeys.some((sectionKey) => {
                if (sectionKey === powerSectionKey) {
                    return !areValidationTableRowsEqual(previousDevice.powerRows, incomingDevice.powerRows);
                }

                const previousSection = previousDevice.sections[sectionKey];
                const incomingSection = incomingDevice.sections[sectionKey];
                if (!previousSection || !incomingSection) {
                    return previousSection !== incomingSection;
                }

                return (
                    previousSection.title !== incomingSection.title ||
                    !areValidationTableRowsEqual(previousSection.rows, incomingSection.rows)
                );
            });

        const nextDevice: DeviceValidationFailures = {
            ...previousDevice,
            lastValidated: previousDevice.lastValidated,
            reachability: incomingReachability,
            sections: { ...previousDevice.sections },
            sectionOrder: [...previousDevice.sectionOrder],
            powerRows: previousDevice.powerRows,
            presentSectionKeys: incomingPeriodicSectionKeys,
            periodicSectionKeys: incomingPeriodicSectionKeys,
        };

        previousPeriodicSectionKeys.forEach((sectionKey) => {
            if (incomingPeriodicSectionKeys.includes(sectionKey)) {
                return;
            }

            if (sectionKey === powerSectionKey) {
                return;
            }

            delete nextDevice.sections[sectionKey];
            nextDevice.sectionOrder = nextDevice.sectionOrder.filter(
                (existingSectionKey) => existingSectionKey !== sectionKey
            );
        });

        incomingPeriodicSectionKeys.forEach((sectionKey) => {
            if (sectionKey === powerSectionKey) {
                nextDevice.powerRows = incomingDevice.powerRows;
                return;
            }

            const incomingSection = incomingDevice.sections[sectionKey];
            if (incomingSection) {
                nextDevice.sections[sectionKey] = incomingSection;
                if (!nextDevice.sectionOrder.includes(sectionKey)) {
                    nextDevice.sectionOrder.push(sectionKey);
                }
                return;
            }

            delete nextDevice.sections[sectionKey];
            nextDevice.sectionOrder = nextDevice.sectionOrder.filter(
                (existingSectionKey) => existingSectionKey !== sectionKey
            );
        });

        const finalizedNextDevice = finalizeCounts(nextDevice);
        if (
            !periodicSectionsChanged &&
            previousReachability === incomingReachability
        ) {
            merged[deviceName] = previousDevice;
            return;
        }

        merged[deviceName] = finalizedNextDevice;
    });

    return areValidationFailuresByDeviceEqual(previous, merged) ? previous : merged;
}

function mergeDeviceRefreshTimestamps(
    previous: Record<string, string | null>,
    incoming: ValidationFailuresByDevice
): Record<string, string | null> {
    let changed = false;
    const next = { ...previous };

    Object.entries(incoming).forEach(([deviceName, deviceFailures]) => {
        const nextTimestamp = deviceFailures.lastValidated ?? null;
        if (next[deviceName] !== nextTimestamp) {
            next[deviceName] = nextTimestamp;
            changed = true;
        }
    });

    return changed ? next : previous;
}

function stampValidationFailuresWithResponseTime(
    failuresByDevice: ValidationFailuresByDevice,
    responseTimestamp: string
): ValidationFailuresByDevice {
    const stampedEntries = Object.entries(failuresByDevice).map(([deviceName, deviceFailures]) => [
        deviceName,
        {
            ...deviceFailures,
            lastValidated: responseTimestamp,
        },
    ]);

    return Object.fromEntries(stampedEntries);
}

function isSectionTitle(sectionTitle: string, expectedTitle: string): boolean {
    return normalizeSectionKey(sectionTitle) === normalizeSectionKey(expectedTitle);
}

function isHostTransceiverSectionTitle(sectionTitle: string): boolean {
    return normalizeSectionKey(sectionTitle) === normalizeSectionKey("GPU Host Transceiver");
}

function getLookupValue(
    primary: unknown,
    fallback?: unknown
): string {
    if (isLookupPortValue(primary == null ? "" : String(primary))) {
        return String(primary ?? "").trim();
    }

    if (isLookupPortValue(fallback == null ? "" : String(fallback))) {
        return String(fallback ?? "").trim();
    }

    return "";
}

function buildNonLldpPatchPanelLookupKeys(row: ValidationTableRow): string[] {
    const lookupKeys: string[] = [];
    const seen = new Set<string>();
    const candidates: Array<[string, string]> = [
        [getLookupValue(row.deviceName), getLookupValue(row.devicePort)],
        [getLookupValue(row.sourceDeviceName), getLookupValue(row.sourceDevicePort)],
        [
            getLookupValue(row.remoteDeviceName, row.remoteDevice),
            getLookupValue(row.remoteDevicePort, row.remoteInterface),
        ],
        [getLookupValue(row.validationDeviceName), getLookupValue(row["Port Name"])],
        [getLookupValue(row["Host Name"]), getLookupValue(row["Port Name"])],
    ];

    candidates.forEach(([deviceName, devicePort]) => {
        if (!deviceName || !devicePort) {
            return;
        }

        buildPatchPanelLookupKeys(deviceName, devicePort).forEach((lookupKey) => {
            if (seen.has(lookupKey)) {
                return;
            }
            seen.add(lookupKey);
            lookupKeys.push(lookupKey);
        });
    });

    return lookupKeys;
}

function normalizePortMembership(devicePort: string | undefined | null): { basePort: string; members: number[] } | null {
    const normalizedPort = String(devicePort || "").trim();
    if (!normalizedPort) return null;

    const groupedPortMatch = normalizedPort.match(/^(.*\[)([^\]]+)(\].*)$/);
    if (groupedPortMatch) {
        const [, prefix, groupedSegment, suffix] = groupedPortMatch;
        const prefixWithoutBracket = prefix.slice(0, -1);
        const suffixWithoutBracket = suffix.startsWith("]") ? suffix.slice(1) : suffix;
        const separatorMatch = prefixWithoutBracket.match(/([\/-])$/);
        const separator = separatorMatch ? separatorMatch[1] : "";
        const basePrefix = separator ? prefixWithoutBracket.slice(0, -1) : prefixWithoutBracket;
        const trailingNumberMatch = basePrefix.match(/^(.*?)(\d+)$/);

        const members = groupedSegment
            .split("+")
            .map((part) => Number(part.trim()))
            .filter((part) => Number.isFinite(part))
            .sort((a, b) => a - b);

        if (members.length === 0) return null;

        const basePort = trailingNumberMatch
            ? `${trailingNumberMatch[1]}${separator}${suffixWithoutBracket}`
            : `${basePrefix}${suffixWithoutBracket}`;

        return {
            basePort: basePort.toLowerCase(),
            members,
        };
    }

    const singlePortMatch = normalizedPort.match(/^(.*?)(\d+)$/);
    if (!singlePortMatch) return null;

    const [, prefix, trailingNumberText] = singlePortMatch;
    const trailingNumber = Number(trailingNumberText);
    if (!Number.isFinite(trailingNumber)) return null;

    return {
        basePort: prefix.toLowerCase(),
        members: [trailingNumber],
    };
}

function expandFamilyPortVariants(devicePort: string | undefined | null): string[] {
    const normalizedPort = String(devicePort || "").trim();
    if (!normalizedPort) return [];

    const membership = normalizePortMembership(normalizedPort);
    if (!membership || membership.members.length === 1) {
        return [normalizedPort];
    }

    const variants = new Set<string>([normalizedPort]);
    membership.members.forEach((member) => {
        variants.add(`${membership.basePort}${member}`);
    });

    return Array.from(variants);
}

function buildPatchPanelLookupKeys(
    deviceName: string | undefined | null,
    devicePort: string | undefined | null
): string[] {
    const normalizedDeviceName = String(deviceName || "").trim();
    if (!normalizedDeviceName) return [];

    const lookupKeys = new Set<string>();
    expandFamilyPortVariants(devicePort).forEach((portVariant) => {
        lookupKeys.add(normalizeDevicePortKey(normalizedDeviceName, portVariant));
    });

    const membership = normalizePortMembership(devicePort);
    if (membership && membership.members.length === 1) {
        const member = membership.members[0];
        const pairStart = member % 2 === 0 ? member - 1 : member;
        if (pairStart > 0) {
            lookupKeys.add(normalizeDevicePortKey(normalizedDeviceName, `${membership.basePort}${pairStart}`));
            lookupKeys.add(normalizeDevicePortKey(normalizedDeviceName, `${membership.basePort}${pairStart + 1}`));
            lookupKeys.add(normalizeDevicePortKey(normalizedDeviceName, `${membership.basePort}[${pairStart}+${pairStart + 1}]`));
        }
    }

    return Array.from(lookupKeys);
}

function collectPatchPanelLookupKeysFromFailures(
    failuresByDevice: ValidationFailuresByDevice
): Set<string> {
    const lookupKeys = new Set<string>();

    Object.values(failuresByDevice).forEach((deviceFailures) => {
        deviceFailures.sectionOrder.forEach((sectionKey) => {
            const section = deviceFailures.sections[sectionKey];
            if (!section || isSectionTitle(section.title, "Fan Errors")) {
                return;
            }

            section.rows.forEach((row) => {
                let rowLookupKeys: string[] = [];
                if (isSectionTitle(section.title, "LLDP Errors")) {
                    const primaryName = getLookupValue(row.deviceAName);
                    const primaryPort = getLookupValue(row.deviceAPort);
                    if (primaryName && primaryPort) {
                        rowLookupKeys.push(...buildPatchPanelLookupKeys(primaryName, primaryPort));
                    }

                    const expectedName = getLookupValue(row.expectedDeviceBName);
                    const expectedPort = getLookupValue(row.expectedDeviceBPort);
                    if (expectedName && expectedPort) {
                        rowLookupKeys.push(...buildPatchPanelLookupKeys(expectedName, expectedPort));
                    }
                } else {
                    rowLookupKeys = buildNonLldpPatchPanelLookupKeys(row);
                }

                rowLookupKeys.forEach((lookupKey) => lookupKeys.add(lookupKey));
            });
        });
    });

    return lookupKeys;
}

function normalizeDeviceKey(value: string | null | undefined): string {
    return String(value || "").trim().toLowerCase();
}

function normalizeDevicePortKey(
    deviceName: string | null | undefined,
    devicePort: string | null | undefined
): string {
    return `${normalizeDeviceKey(deviceName)}|${normalizeDeviceKey(devicePort)}`;
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

function toRawJsonString(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function isLookupPortValue(value: string | null | undefined): boolean {
    const normalized = normalizeDeviceKey(value);
    return (
        normalized !== "" &&
        normalized !== "unknown" &&
        normalized !== "n/a" &&
        normalized !== "na" &&
        normalized !== "-" &&
        normalized !== "null"
    );
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

function indexPatchPanelRowsByDevicePort(
    rows: PatchPanelRow[],
    allowedLookupKeys?: Set<string>
): PatchPanelByDevicePort {
    const byDevicePort: PatchPanelByDevicePort = {};

    rows.forEach((row) => {
        const deviceKey = normalizeDeviceKey(row.deviceName);
        if (!deviceKey) {
            return;
        }

        const addRowForKey = (key: string) => {
            if (!byDevicePort[key]) {
                byDevicePort[key] = [];
            }
            byDevicePort[key].push({
                ...row,
                rawJson: toRawJsonString(row),
            });
        };

        if (isLookupPortValue(row.devicePort)) {
            const devicePortKeys = buildPatchPanelLookupKeys(row.deviceName, row.devicePort);
            devicePortKeys.forEach((devicePortKey) => {
                if (allowedLookupKeys && !allowedLookupKeys.has(devicePortKey)) {
                    return;
                }
                addRowForKey(devicePortKey);
            });
        }
    });

    return byDevicePort;
}
