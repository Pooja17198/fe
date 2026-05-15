import { h } from "preact";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import PagingDataProviderView = require("ojs/ojpagingdataproviderview");
import { useEffect, useMemo, useState, useRef } from "preact/hooks";
import "ojs/ojtable";
import { TableIntrinsicProps, ojTable } from "ojs/ojtable";
import { KeySetImpl } from "ojs/ojkeyset";
import "ojs/ojprogress-circle";
import "ojs/ojpagingcontrol";
import { ProjectLoadMeasurement } from "./types";
import { emitMetric, TELEMETRY_METRICS } from "../telemetry/api";
import { getLvvApiBase } from "../../config/api";
import { fetchWithRetry } from "../rack/api";
import type { RackValidationSummary } from "../rack/validationShared";
import {
    asArray,
    asRecord,
    normalizeValidationFailuresPayload,
    NOT_VALIDATED_SUMMARY,
    summarizeValidationFailuresByDevice,
} from "../rack/validationShared";
import {
    getLocalRackStubRows,
    getLocalRackStubValidationPayload,
    mergeLocalRackStubRows,
} from "../../localRackStub";

const BASE_RACK_COLUMNS = [
    { headerText: "Rack Location", field: "rackLocation", id: "rackLocation", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Platform", field: "platformName", id: "platformName", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Block", field: "block", id: "block", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Rack Serial Number", field: "rackSerialNumber", id: "rackSerialNumber", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "GPU Rack", field: "gpuRackLabel", id: "gpuRackLabel", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Issue(s) Type", field: "ticketType", id: "ticketType", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Ticket", field: "ticketId", id: "ticketId", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Rack State", field: "rackState", id: "rackState", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Validation Status", field: "_validationStatus", id: "validationStatus", resizable: "enabled" as const, template: "validationStatusTemplate" }
];

type Project = {
    projectId: string;
    building: string;
    blocks: string[];
    prefilterBlocks?: string[];
};

type Props = {
    isActive?: boolean;
    project: Project;
    onRackChanged: (value: any) => void;
    region: string;
    projectLoadMeasurement?: ProjectLoadMeasurement | null;
};

const INIT_SELECTION_MODE: TableIntrinsicProps['selectionMode'] = {
    column: 'none',
    row: 'single'
};

// TODO: Check it out
const ACC = {rowHeader: "Rack"}

const API_URL = getLvvApiBase();

interface ProjectRackRow {
    _key: string;
    building: string;
    block: string;
    rackLocation: string;
    rackSerialNumber: string;
    isGpuRack?: boolean;
    availabilityDomain?: string;
    gpuRackLabel?: string;
    ticketType?: string;
    ticketId?: string;
    resolveEnabled?: boolean;
    resolveDisabledReason?: string;
    rackState?: string;
    platformName?: string;
    _validationReady?: number;
}

type RackStatusToken = {
    className: string;
    label: string;
    title: string;
};

const PHOENIX_REGION = "us-phoenix-1";

type RackValidationReadySummary = {
    readyCount: number;
};

type RackHostCountSummary = {
    hopsCount: number;
    lvvCount: number;
    cpvCount: number;
    customerCount: number;
};

type RackHostReadinessSummaries = {
    readySummary: RackValidationReadySummary;
    hostCountSummary: RackHostCountSummary;
};

const EMPTY_VALIDATION_READY_SUMMARY: RackValidationReadySummary = {
    readyCount: 0,
};

const EMPTY_HOST_COUNT_SUMMARY: RackHostCountSummary = {
    hopsCount: 0,
    lvvCount: 0,
    cpvCount: 0,
    customerCount: 0,
};

function isEmptyObject(value: Record<string, unknown>): boolean {
    return Object.keys(value).length === 0;
}

function getRackSearchTerms(q: string): string[] {
    return q
        .split(",")
        .map((term) => term.trim())
        .filter((term) => term.length > 0);
}

async function fetchRackValidationPayload(
    row: ProjectRackRow,
    region: string,
    signal: AbortSignal
): Promise<unknown | null> {
    const localStubPayload = getLocalRackStubValidationPayload({
        region,
        building: row.building,
        rackNumber: row.rackLocation,
        rackSerialNumber: row.rackSerialNumber,
    });
    if (localStubPayload) {
        return localStubPayload;
    }

    const validationUrl = new URL(`${API_URL}/cablingValidation`);
    validationUrl.searchParams.set("regionName", region);
    validationUrl.searchParams.set("rackSerialNumber", row.rackSerialNumber);

    const response = await fetchWithRetry(validationUrl.href, { method: "GET", signal });
    if (!response.ok) {
        return null;
    }

    const body = await response.text();
    if (!body.trim()) {
        return null;
    }

    try {
        return JSON.parse(body) as unknown;
    } catch {
        return null;
    }
}

async function fetchRackHostReadinessPayload(
    row: ProjectRackRow,
    region: string,
    signal: AbortSignal
): Promise<unknown | null> {
    if (!row.isGpuRack || !row.rackSerialNumber || !region) {
        return null;
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
        try {
            const readinessUrl = new URL(`${API_URL}/rackHostCableValidationReadiness`);
            readinessUrl.searchParams.set("rackSerialNumber", row.rackSerialNumber);
            readinessUrl.searchParams.set("regionName", region);
            readinessUrl.searchParams.set("availabilityDomain", availabilityDomain);
            readinessUrl.searchParams.set("building", row.building);
            readinessUrl.searchParams.set("block", row.block);

            const response = await fetchWithRetry(readinessUrl.href, { method: "GET", signal });
            if (!response.ok) {
                continue;
            }

            const body = await response.text();
            if (!body.trim()) {
                continue;
            }

            const payload: unknown = JSON.parse(body);
            if (getHostReadinessItems(payload).length > 0) {
                return payload;
            }
        } catch (e) {
            if ((e as any)?.name === "AbortError") {
                throw e;
            }
        }
    }

    return null;
}

function buildRackStatusTokens(summary: RackValidationSummary, region?: string): RackStatusToken[] {
    if (!summary.isValidated) {
        return [
            {
                className: "rack-status-chip pending",
                label: "UNVAL",
                title: "Validation has not been triggered or has no results yet",
            }
        ];
    }

    if (
        summary.cableFailures === 0 &&
        summary.opticsFailures === 0 &&
        summary.hostOpticsFailures === 0 &&
        summary.deviceFailures === 0
    ) {
        return [
            {
                className: "rack-status-chip success",
                label: "CLEAN",
                title: "Validated with no failures",
            }
        ];
    }

    const tokens: RackStatusToken[] = [];

    if (region === PHOENIX_REGION) {
        if (summary.lldpFailures > 0) {
            tokens.push({
                className: "rack-status-chip lldp-failure",
                label: `LLDP:${summary.lldpFailures}`,
                title: `${summary.lldpFailures} LLDP validation failure${summary.lldpFailures === 1 ? "" : "s"}`,
            });
        }

        if (summary.interfaceFailures > 0) {
            tokens.push({
                className: "rack-status-chip interface-failure",
                label: `INTERFACE:${summary.interfaceFailures}`,
                title: `${summary.interfaceFailures} interface validation failure${summary.interfaceFailures === 1 ? "" : "s"}`,
            });
        }

        if (summary.opticModuleFailures > 0) {
            tokens.push({
                className: "rack-status-chip phoenix-optics-failure",
                label: `OPTICS:${summary.opticModuleFailures}`,
                title: `${summary.opticModuleFailures} optics validation failure${summary.opticModuleFailures === 1 ? "" : "s"}`,
            });
        }

        if (summary.fecBerFailures > 0) {
            tokens.push({
                className: "rack-status-chip fec-ber-failure",
                label: `FEC BER:${summary.fecBerFailures}`,
                title: `${summary.fecBerFailures} FEC BER validation failure${summary.fecBerFailures === 1 ? "" : "s"}`,
            });
        }
    } else {
        if (summary.cableFailures > 0) {
            tokens.push({
                className: "rack-status-chip cable-failure",
                label: `CABLE:${summary.cableFailures}`,
                title: `${summary.cableFailures} cable validation failure${summary.cableFailures === 1 ? "" : "s"}`,
            });
        }

        if (summary.opticsFailures > 0) {
            tokens.push({
                className: "rack-status-chip optics-failure",
                label: `OPTICS:${summary.opticsFailures}`,
                title: `${summary.opticsFailures} optics validation failure${summary.opticsFailures === 1 ? "" : "s"}`,
            });
        }
    }

    if (summary.hostOpticsFailures > 0) {
        if (region === PHOENIX_REGION) {
            if (summary.hostOptFailures > 0) {
                tokens.push({
                    className: "rack-status-chip host-opt-failure",
                    label: `HOST_OPT:${summary.hostOptFailures}`,
                    title: `${summary.hostOptFailures} host transceiver optics validation failure${summary.hostOptFailures === 1 ? "" : "s"}`,
                });
            }

            if (summary.hostFecBerFailures > 0) {
                tokens.push({
                    className: "rack-status-chip host-fec-ber-failure",
                    label: `HOST_FEC_BER:${summary.hostFecBerFailures}`,
                    title: `${summary.hostFecBerFailures} host transceiver FEC BER validation failure${summary.hostFecBerFailures === 1 ? "" : "s"}`,
                });
            }
        } else {
            tokens.push({
                className: "rack-status-chip host-optics-failure",
                label: `HOST_OPTICS:${summary.hostOpticsFailures}`,
                title: `${summary.hostOpticsFailures} host transceiver optics/FEC-BER validation failure${summary.hostOpticsFailures === 1 ? "" : "s"}`,
            });
        }
    }

    if (summary.deviceFailures > 0) {
        tokens.push({
            className: "rack-status-chip device-failure",
            label: `DEVICE:${summary.deviceFailures}`,
            title: `${summary.deviceFailures} device validation failure${summary.deviceFailures === 1 ? "" : "s"}`,
        });
    }

    return tokens;
}

function renderRackStatus(summary: RackValidationSummary | undefined, region?: string) {
    if (!summary) {
        return <span class="rack-status-text muted">Loading...</span>;
    }

    return (
        <span class="rack-status-cell">
            {buildRackStatusTokens(summary, region).map((token) => (
                <span key={token.label} class={token.className} title={token.title}>
                    {token.label}
                </span>
            ))}
        </span>
    );
}

async function fetchRackValidationSummary(
    row: ProjectRackRow,
    region: string,
    signal: AbortSignal
): Promise<RackValidationSummary> {
    if (!row.rackSerialNumber || !region) {
        return NOT_VALIDATED_SUMMARY;
    }

    const cablingPayload = await fetchRackValidationPayload(row, region, signal);
    const cablingFailuresByDevice = cablingPayload
        ? normalizeValidationFailuresPayload(cablingPayload, row.rackSerialNumber)
        : {};

    return summarizeValidationFailuresByDevice(cablingFailuresByDevice);
}

function getHostReadinessItems(payload: unknown): Record<string, unknown>[] {
    const payloadRecord = asRecord(payload);
    if (!payloadRecord) {
        return [];
    }

    return asArray(payloadRecord["hostReadiness"])
        .map((rawItem) => asRecord(rawItem))
        .filter((item): item is Record<string, unknown> => item !== null);
}

function summarizeHostReadinessPayload(payload: unknown | null): RackValidationReadySummary {
    const readyCount = getHostReadinessItems(payload).reduce<number>((count, item) => {
        const status = String(item["status"] ?? "").trim().toUpperCase();
        return status === "LVV" ? count + 1 : count;
    }, 0);

    return { readyCount };
}

function summarizeHostCountPayload(payload: unknown | null): RackHostCountSummary {
    return getHostReadinessItems(payload).reduce<RackHostCountSummary>((summary, item) => {
        const status = String(item["status"] ?? "").trim().toUpperCase();
        if (status.startsWith("HOPS")) {
            summary.hopsCount += 1;
        } else if (status === "LVV") {
            summary.lvvCount += 1;
        } else if (status.startsWith("CPV")) {
            summary.cpvCount += 1;
        } else if (status.startsWith("CUSTOMER")) {
            summary.customerCount += 1;
        }

        return summary;
    }, {
        hopsCount: 0,
        lvvCount: 0,
        cpvCount: 0,
        customerCount: 0,
    });
}

async function fetchRackHostReadinessSummaries(
    row: ProjectRackRow,
    region: string,
    signal: AbortSignal
): Promise<RackHostReadinessSummaries> {
    const payload = await fetchRackHostReadinessPayload(row, region, signal);
    return {
        readySummary: payload ? summarizeHostReadinessPayload(payload) : EMPTY_VALIDATION_READY_SUMMARY,
        hostCountSummary: payload ? summarizeHostCountPayload(payload) : EMPTY_HOST_COUNT_SUMMARY,
    };
}

const ProjectDetailsContainer = (props: Props) => {

    const [allProjectData, setAllProjectData] = useState<ProjectRackRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [rackStatusByKey, setRackStatusByKey] = useState<Record<string, RackValidationSummary | undefined>>({});
    const [rackValidationReadyByKey, setRackValidationReadyByKey] = useState<Record<string, RackValidationReadySummary | undefined>>({});
    const [rackHostCountByKey, setRackHostCountByKey] = useState<Record<string, RackHostCountSummary | undefined>>({});
    const [isRefreshingHostReadiness, setIsRefreshingHostReadiness] = useState(false);

    const [activeBlocks, setActiveBlocks] = useState<string[]>([]);
    const [searchText, setSearchText] = useState("");
    const [hideMissingSerial, setHideMissingSerial] = useState(false);
    const [pageSize, setPageSize] = useState<number>(25);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const requestSeqRef = useRef(0);
    const statusRequestSeqRef = useRef(0);
    const [includeInServiceRacks, setIncludeInServiceRacks] = useState(false);
    const [showOnlyGpuRacks, setShowOnlyGpuRacks] = useState(false);
    const [loadedMeasurement, setLoadedMeasurement] = useState<null | {
        measurementId: number;
        startedAt: number;
        rackCount: number;
        projectId: string;
    }>(null);
    const emittedProjectMeasurementRef = useRef<number | null>(null);
    const allBlocks = useMemo(() => {
        const src = Array.isArray(props.project?.blocks) ? props.project.blocks : [];
        return Array.from(
            new Set(
                src
                    .map((b) => (b == null ? '' : String(b)))
                    .map((b) => b.trim())
                    .filter((b) => b.length > 0)
            )
        );
    }, [props.project]);

    // Default to Select All
    useEffect(() => {
        setActiveBlocks(allBlocks);
    }, [allBlocks, props.region]);

    // Clear the GPU-only filter when the selected project changes.
    useEffect(() => {
        setShowOnlyGpuRacks(false);
    }, [props.project?.projectId]);

    // Select All checkbox
    const allSelected = allBlocks.length > 0 && activeBlocks.length === allBlocks.length;
    const noneSelected = activeBlocks.length === 0;
    const someSelected = !allSelected && !noneSelected;
    const selectAllRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
    }, [someSelected]);

    useEffect(() => {
        // Route changes run the previous cleanup first; skip starting Home table work while hidden.
        if (props.isActive === false) {
            return;
        }

        const ac = new AbortController();
        const fetchId = ++requestSeqRef.current;
        setLoadedMeasurement(null);

        const fetchAllData = async () => {
            setAllProjectData([]); // clear previous
            setLoadError(null);

            if (!props.project?.projectId) {
                if (fetchId === requestSeqRef.current) {
                    setLoading(false);
                }
                return;
            }

            // Start loading for this requestId
            if (fetchId === requestSeqRef.current) {
                setLoading(true);
            }

            try {
                const headers = new Headers();
                const projectRacksUrl = new URL(`${API_URL}/racksInProject`);
                projectRacksUrl.searchParams.set("projectId", props.project.projectId);
                projectRacksUrl.searchParams.set("regionName", props.region);

                const rackResp = await fetchWithRetry(projectRacksUrl.href, { method: "GET", headers, signal: ac.signal });
                if (!rackResp.ok) {
                    const stubRows = getLocalRackStubRows(props.project.projectId, props.region);
                    if (stubRows.length > 0 && fetchId === requestSeqRef.current) {
                        setAllProjectData(
                            stubRows.map((r) => ({
                                ...r,
                                gpuRackLabel: r.isGpuRack ? "Yes" : "No",
                                _key: `${r.block ?? ''}|${r.rackLocation ?? ''}`,
                            }))
                        );
                        return;
                    }
                    if (fetchId === requestSeqRef.current) {
                        setAllProjectData([]);
                        setLoadError(
                            `Failed to load racks from Storekeeper API (/racksInProject). ` +
                            `Status: ${rackResp.status} ${rackResp.statusText}`
                        );
                    }
                    return;
                }

                const rows: ProjectRackRow[] = await rackResp.json();
                const normalized: ProjectRackRow[] = mergeLocalRackStubRows(rows || [], props.project.projectId, props.region).map((r) => ({
                    ...r,
                    gpuRackLabel: r.isGpuRack ? "Yes" : "No",
                    _key: `${r.block ?? ''}|${r.rackLocation ?? ''}`
                }));
                if (fetchId === requestSeqRef.current) {
                    setAllProjectData(normalized);
                    if (
                        props.projectLoadMeasurement &&
                        props.projectLoadMeasurement.projectId === props.project.projectId
                    ) {
                        setLoadedMeasurement({
                            measurementId: props.projectLoadMeasurement.measurementId,
                            startedAt: props.projectLoadMeasurement.startedAt,
                            rackCount: rows.length,
                            projectId: props.project.projectId,
                        });
                    }
                }
            } catch (e) {
                if ((e as any)?.name === 'AbortError') {
                    // Request was aborted due to a newer selection/unmount; ignore
                    return;
                }
                console.error('Failed to fetch project racks:', e);
                if (fetchId === requestSeqRef.current) {
                    const stubRows = getLocalRackStubRows(props.project.projectId, props.region);
                    if (stubRows.length > 0) {
                        setAllProjectData(
                            stubRows.map((r) => ({
                                ...r,
                                gpuRackLabel: r.isGpuRack ? "Yes" : "No",
                                _key: `${r.block ?? ''}|${r.rackLocation ?? ''}`,
                            }))
                        );
                        setLoadError(null);
                        return;
                    }
                    setAllProjectData([]);
                    const msg = (e as any)?.message ? String((e as any).message) : 'Unknown error';
                    setLoadError(`Failed to load racks list: ${msg}`);
                }
            } finally {
                if (fetchId === requestSeqRef.current) {
                    setLoading(false);  // Stop loading only if this is the latest request
                }
            }
        };

        fetchAllData();

        return () => ac.abort(); // cancel any in-flight request when selection changes/unmounts
    }, [props.isActive, props.project, props.region, props.projectLoadMeasurement]);

    useEffect(() => {
        if (loading || loadError || !loadedMeasurement) {
            return;
        }
        if (props.project.projectId !== loadedMeasurement.projectId) {
            return;
        }
        if (emittedProjectMeasurementRef.current === loadedMeasurement.measurementId) {
            return;
        }

        const raf = requestAnimationFrame(() => {
            const blockCount = Array.from(
                new Set(
                    (Array.isArray(props.project?.blocks) ? props.project.blocks : [])
                        .map((b) => (b == null ? '' : String(b)))
                        .map((b) => b.trim())
                        .filter((b) => b.length > 0)
                )
            ).length;

            void emitMetric(TELEMETRY_METRICS.PROJECT_DETAILS_TABLE_LOAD_LATENCY, Date.now() - loadedMeasurement.startedAt, {
                region: props.region,
                building: props.project.building,
                blockCount,
                project: props.project.projectId,
                rackCount: loadedMeasurement.rackCount,
            }).catch(() => undefined);

            emittedProjectMeasurementRef.current = loadedMeasurement.measurementId;
        });

        return () => cancelAnimationFrame(raf);
    }, [loading, loadError, loadedMeasurement, props.project, props.region]);

    const filteredBaseRows = useMemo((): ProjectRackRow[] => {
        if (activeBlocks.length === 0) {
            return [];
        }

        let rows = allProjectData.filter((row) => row.block && activeBlocks.includes(row.block));

        if (!includeInServiceRacks) {
            rows = rows.filter((row) => (row.rackState || '').toUpperCase() !== 'IN-SERVICE');
        }

        if (showOnlyGpuRacks) {
            rows = rows.filter((row) => row.isGpuRack);
        }

        if (hideMissingSerial) {
            rows = rows.filter((row) => row.rackSerialNumber && row.rackSerialNumber.trim() !== "");
        }

        const q = searchText.trim().toLowerCase();
        if (q) {
            const rackSearchItems = getRackSearchTerms(q);
            const isMultiRackSearch = q.includes(",");

            if (isMultiRackSearch && rackSearchItems.length > 0) {
                rows = rows.filter((row) => {
                    const rackLocation = String(row.rackLocation || "").trim();
                    return rackSearchItems.some((term) => rackLocation.includes(term));
                });
            } else {
                rows = rows.filter((row) => {
                    const haystack = [
                        row.rackLocation,
                        row.block,
                        row.rackSerialNumber,
                        row.gpuRackLabel || "",
                        row.ticketType || "",
                        row.ticketId || "",
                        row.rackState || "",
                        row.platformName
                    ].join(" ").toLowerCase();
                    return haystack.includes(q);
                });
            }
        }

        return rows;

    }, [
        activeBlocks,
        allProjectData,
        hideMissingSerial,
        searchText,
        includeInServiceRacks,
        showOnlyGpuRacks,
    ]);

    const baseDataProvider = useMemo(
        () => new ArrayDataProvider(filteredBaseRows, { keyAttributes: "_key" }),
        [filteredBaseRows]
    );
    const pagingDataProvider = useMemo(
        () => new PagingDataProviderView(baseDataProvider),
        [baseDataProvider]
    );
    const visibleRows = useMemo((): ProjectRackRow[] => {
        const startIndex = currentPage * pageSize;
        return filteredBaseRows.slice(startIndex, startIndex + pageSize);
    }, [currentPage, filteredBaseRows, pageSize]);
    const visibleRowsSignature = useMemo(
        () => visibleRows.map((row) => `${row._key}|${row.rackSerialNumber ?? ""}|${row.isGpuRack ? 1 : 0}`).join("::"),
        [visibleRows]
    );


    // Reset paging when filters change or page size changes
    useEffect(() => {
        setCurrentPage(0);
        (pagingDataProvider as any).setPage(0, { pageSize });
    }, [pageSize, searchText, hideMissingSerial, activeBlocks, includeInServiceRacks, showOnlyGpuRacks, props.project?.projectId]);

    useEffect(() => {
        const provider = pagingDataProvider as any;
        const syncCurrentPage = (event?: Event) => {
            const nextPage =
                typeof (event as any)?.detail?.page === "number"
                    ? (event as any).detail.page
                    : typeof provider.getPage === "function"
                        ? provider.getPage()
                        : 0;
            setCurrentPage((prev) => (prev === nextPage ? prev : nextPage));
        };

        syncCurrentPage();
        provider.addEventListener?.("page", syncCurrentPage);

        return () => {
            provider.removeEventListener?.("page", syncCurrentPage);
        };
    }, [pagingDataProvider]);

    useEffect(() => {
        if (props.isActive === false) {
            return;
        }

        const ac = new AbortController();
        const requestId = ++statusRequestSeqRef.current;

        if (!props.project?.projectId || visibleRows.length === 0) {
            setRackStatusByKey((prev) => (isEmptyObject(prev) ? prev : {}));
            setRackValidationReadyByKey((prev) => (isEmptyObject(prev) ? prev : {}));
            setRackHostCountByKey((prev) => (isEmptyObject(prev) ? prev : {}));
            setIsRefreshingHostReadiness(false);
            return () => ac.abort();
        }

        const nextStatuses: Record<string, RackValidationSummary | undefined> = {};
        const nextReadyByKey: Record<string, RackValidationReadySummary | undefined> = {};
        const nextHostCountByKey: Record<string, RackHostCountSummary | undefined> = {};
        visibleRows.forEach((row) => {
            nextStatuses[row._key] = row.rackSerialNumber ? undefined : NOT_VALIDATED_SUMMARY;
            if (showOnlyGpuRacks && row.isGpuRack) {
                nextReadyByKey[row._key] = row.rackSerialNumber ? undefined : EMPTY_VALIDATION_READY_SUMMARY;
                nextHostCountByKey[row._key] = row.rackSerialNumber ? undefined : EMPTY_HOST_COUNT_SUMMARY;
            }
        });
        setRackStatusByKey(nextStatuses);
        if (showOnlyGpuRacks) {
            setRackValidationReadyByKey(nextReadyByKey);
            setRackHostCountByKey(nextHostCountByKey);
            setIsRefreshingHostReadiness(
                visibleRows.some((row) => row.isGpuRack && row.rackSerialNumber && row.rackSerialNumber.trim() !== "")
            );
        } else {
            setRackValidationReadyByKey((prev) => (isEmptyObject(prev) ? prev : {}));
            setRackHostCountByKey((prev) => (isEmptyObject(prev) ? prev : {}));
            setIsRefreshingHostReadiness(false);
        }

        const rowsToFetch = visibleRows.filter(
            (row) => row.rackSerialNumber && row.rackSerialNumber.trim() !== ""
        );
        const hostReadinessRowsToFetch = showOnlyGpuRacks
            ? rowsToFetch.filter((row) => row.isGpuRack)
            : [];

        if (rowsToFetch.length === 0) {
            if (ac.signal.aborted || requestId !== statusRequestSeqRef.current) {
                return;
            }
            setIsRefreshingHostReadiness(false);
            return () => {
                ac.abort();
                setIsRefreshingHostReadiness(false);
            };
        }

        if (hostReadinessRowsToFetch.length === 0) {
            setIsRefreshingHostReadiness(false);
        }

        let remainingHostReadinessRows = hostReadinessRowsToFetch.length;
        const finishHostReadinessRow = () => {
            remainingHostReadinessRows -= 1;
            if (
                remainingHostReadinessRows === 0 &&
                !ac.signal.aborted &&
                requestId === statusRequestSeqRef.current
            ) {
                setIsRefreshingHostReadiness(false);
            }
        };

        rowsToFetch.forEach((row) => {
            void (async () => {
                try {
                    const statusSummary = await fetchRackValidationSummary(row, props.region, ac.signal);
                    if (ac.signal.aborted || requestId !== statusRequestSeqRef.current) {
                        return;
                    }

                    setRackStatusByKey((prev) => ({
                        ...prev,
                        [row._key]: statusSummary,
                    }));
                } catch (e) {
                    if ((e as any)?.name === 'AbortError') {
                        return;
                    }
                    if (ac.signal.aborted || requestId !== statusRequestSeqRef.current) {
                        return;
                    }

                    setRackStatusByKey((prev) => ({
                        ...prev,
                        [row._key]: NOT_VALIDATED_SUMMARY,
                    }));
                }
            })();
        });

        hostReadinessRowsToFetch.forEach((row) => {
            void (async () => {
                try {
                    const { readySummary, hostCountSummary } =
                        await fetchRackHostReadinessSummaries(row, props.region, ac.signal);
                    if (ac.signal.aborted || requestId !== statusRequestSeqRef.current) {
                        return;
                    }

                    setRackValidationReadyByKey((prev) => ({
                        ...prev,
                        [row._key]: readySummary,
                    }));
                    setRackHostCountByKey((prev) => ({
                        ...prev,
                        [row._key]: hostCountSummary,
                    }));
                } catch (e) {
                    if ((e as any)?.name === 'AbortError') {
                        return;
                    }
                    if (ac.signal.aborted || requestId !== statusRequestSeqRef.current) {
                        return;
                    }

                    if (row.isGpuRack) {
                        setRackValidationReadyByKey((prev) => ({
                            ...prev,
                            [row._key]: EMPTY_VALIDATION_READY_SUMMARY,
                        }));
                        setRackHostCountByKey((prev) => ({
                            ...prev,
                            [row._key]: EMPTY_HOST_COUNT_SUMMARY,
                        }));
                    }
                } finally {
                    finishHostReadinessRow();
                }
            })();
        });

        return () => {
            ac.abort();
            setIsRefreshingHostReadiness(false);
        };
    }, [props.isActive, props.project, props.region, visibleRowsSignature, showOnlyGpuRacks]);

    const handleRefreshHostReadiness = async (rows: ProjectRackRow[], signal?: AbortSignal) => {
        if (!showOnlyGpuRacks) {
            if (!signal?.aborted) {
                setRackValidationReadyByKey((prev) => (isEmptyObject(prev) ? prev : {}));
                setRackHostCountByKey((prev) => (isEmptyObject(prev) ? prev : {}));
                setIsRefreshingHostReadiness(false);
            }
            return;
        }

        const rowsToFetch = rows.filter(
            (row) => row.isGpuRack && row.rackSerialNumber && row.rackSerialNumber.trim() !== ""
        );

        if (rowsToFetch.length === 0) {
            if (!signal?.aborted) {
                setRackValidationReadyByKey((prev) => (isEmptyObject(prev) ? prev : {}));
                setRackHostCountByKey((prev) => (isEmptyObject(prev) ? prev : {}));
                setIsRefreshingHostReadiness(false);
            }
            return;
        }

        if (signal?.aborted) {
            return;
        }

        const nextLoadingReadyByKey: Record<string, RackValidationReadySummary | undefined> = {};
        const nextLoadingHostCountByKey: Record<string, RackHostCountSummary | undefined> = {};
        rowsToFetch.forEach((row) => {
            nextLoadingReadyByKey[row._key] = undefined;
            nextLoadingHostCountByKey[row._key] = undefined;
        });

        setRackValidationReadyByKey(nextLoadingReadyByKey);
        setRackHostCountByKey(nextLoadingHostCountByKey);

        setIsRefreshingHostReadiness(true);
        const localController = signal ? null : new AbortController();
        const requestSignal = signal || localController!.signal;

        try {
            await Promise.all(
                rowsToFetch.map(async (row) => {
                    const { readySummary, hostCountSummary } =
                        await fetchRackHostReadinessSummaries(row, props.region, requestSignal);

                    if (requestSignal.aborted) {
                        return;
                    }

                    setRackValidationReadyByKey((prev) => ({
                        ...prev,
                        [row._key]: readySummary,
                    }));
                    setRackHostCountByKey((prev) => ({
                        ...prev,
                        [row._key]: hostCountSummary,
                    }));
                })
            );
        } catch (e) {
            if ((e as any)?.name !== "AbortError") {
                console.warn("Failed to refresh host readiness summaries", e);
            }
        } finally {
            if (!requestSignal.aborted) {
                setIsRefreshingHostReadiness(false);
            }
            localController?.abort();
        }
    };

    // This resets the selectedRowKeySet to empty, so that same row selection triggers onSelectionChangedHandler
    const [selectedRowKeySet, setSelectedRowKeySet] = useState<KeySetImpl<any>>(new KeySetImpl<any>());
    const emptyColumnKeySet = useMemo(() => new KeySetImpl<any>(), []);

    const onSelectionChangedHandler = async (event: ojTable.selectedChanged<any, any>) => {
        const row = event.detail.value.row as KeySetImpl<any>;
        if (row.values().size > 0) {
            const result = await (baseDataProvider as any).fetchByKeys({ keys: row.values() });
            for (const key of row.values()) {
                const item = result.results.get(key);
                if (item && item.data) {
                    props.onRackChanged(item.data as ProjectRackRow);
                }
            }
        }
    };

    const validationStatusTemplate = (context: any) => {
        const row = (context?.item && context.item.data) || {};
        return renderRackStatus(rackStatusByKey[row._key], props.region);
    };

    const validationReadyTemplate = (context: any) => {
        const row = (context?.item && context.item.data) || {};
        const summary = rackValidationReadyByKey[row._key];
        if (summary === undefined) {
            return <span class="rack-status-text muted">Loading...</span>;
        }
        return <span>{summary.readyCount}</span>;
    };

    const hostCountTemplate = (context: any) => {
        const row = (context?.item && context.item.data) || {};
        const summary = rackHostCountByKey[row._key];
        if (summary === undefined) {
            return <span class="rack-status-text muted">Loading...</span>;
        }

        const chips = [
            summary.hopsCount > 0 ? {
                className: "rack-status-chip host-count-hops",
                label: `HOPS:${summary.hopsCount}`,
                title: `${summary.hopsCount} host${summary.hopsCount === 1 ? "" : "s"} in HOPS state`,
            } : null,
            summary.lvvCount > 0 ? {
                className: "rack-status-chip host-count-lvv",
                label: `LVV:${summary.lvvCount}`,
                title: `${summary.lvvCount} host${summary.lvvCount === 1 ? "" : "s"} in LVV state`,
            } : null,
            summary.cpvCount > 0 ? {
                className: "rack-status-chip host-count-cpv",
                label: `CPV:${summary.cpvCount}`,
                title: `${summary.cpvCount} host${summary.cpvCount === 1 ? "" : "s"} in CPV state`,
            } : null,
            summary.customerCount > 0 ? {
                className: "rack-status-chip host-count-customer",
                label: `CUSTOMER:${summary.customerCount}`,
                title: `${summary.customerCount} host${summary.customerCount === 1 ? "" : "s"} in CUSTOMER state`,
            } : null,
        ].filter((chip): chip is RackStatusToken => chip !== null);

        if (chips.length === 0) {
            return <span class="rack-status-text muted">-</span>;
        }

        return (
            <span class="rack-status-cell">
                {chips.map((chip) => (
                    <span key={chip.label} class={chip.className} title={chip.title}>
                        {chip.label}
                    </span>
                ))}
            </span>
        );
    };

    const validationReadyRefreshButton = (
        <button
            type="button"
            class="validation-ready-refresh-button"
            onClick={() => void handleRefreshHostReadiness(visibleRows)}
            disabled={!showOnlyGpuRacks || isRefreshingHostReadiness || allProjectData.length === 0}
            title="Refresh Validation Ready and Host Count"
            aria-label="Refresh Validation Ready and Host Count"
        >
            ↻
        </button>
    );

    const rackColumns = useMemo(() => {
        if (!showOnlyGpuRacks) {
            return BASE_RACK_COLUMNS;
        }

        const validationReadyColumn = {
            headerText: "Validation Ready",
            field: "_validationReady",
            id: "validationReady",
            resizable: "enabled" as const,
            sortable: 'enabled' as const,
            template: "validationReadyTemplate"
        };

        const hostCountColumn = {
            headerText: "Host Count",
            field: "_hostCount",
            id: "hostCount",
            resizable: "enabled" as const,
            template: "hostCountTemplate"
        };

        const rackStateIndex = BASE_RACK_COLUMNS.findIndex((column) => column.id === "rackState");
        if (rackStateIndex === -1) {
            return [...BASE_RACK_COLUMNS, validationReadyColumn, hostCountColumn];
        }

        return [
            ...BASE_RACK_COLUMNS.slice(0, rackStateIndex + 1),
            validationReadyColumn,
            hostCountColumn,
            ...BASE_RACK_COLUMNS.slice(rackStateIndex + 1),
        ];
    }, [showOnlyGpuRacks]);

    return (
        <div id="parentContainer2" class="oj-flex-item oj-md-8 oj-sm-12 oj-reflow">
            <h2>Project {props.project.projectId} Details</h2>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginBottom: '16px'
                }}
            >
            <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
                {/* ROW 1: Search */}
            <div style={{marginBottom: '12px'}}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{fontWeight: 600}}>Search:</span>
                    <input
                        type="text"
                        value={searchText}
                        placeholder="Search rack location(s) / platform / block / serial / type / ticket"
                        onInput={(e: any) =>
                            setSearchText((e.target as HTMLInputElement).value)
                        }
                        style="min-width: 320px;"
                    />
                </label>
            </div>
            {/* ROW 2: Include in-service filter */}
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{display:'flex', alignItems : 'center', gap: '8px' }}>
                    <input
                        type="checkbox"
                        checked={includeInServiceRacks}
                        onChange={(e: any) => setIncludeInServiceRacks((e.target as HTMLInputElement).checked)}
                    />
                    Include in-service racks
                </label>
            </div>
            {/* ROW 3: GPU filter */}
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <input
                        type="checkbox"
                        checked={showOnlyGpuRacks}
                        onChange={(e: any) =>
                            setShowOnlyGpuRacks((e.target as HTMLInputElement).checked)
                        }
                    />
                    GPU racks
                </label>
            </div>
            {/* ROW 4: Block filters */}
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                    <span style={{fontWeight: 600}}>Filter by block:</span>
                    {/*checkbox: Select All */}
                    <label style={{ marginLeft: '8px' }}>
                        <input
                            ref={selectAllRef}
                            type="checkbox"
                            checked={allSelected}
                            onChange={(e: any) => {
                                const checked = (e.target as HTMLInputElement).checked;
                                setActiveBlocks(checked ? allBlocks : []);
                            }}
                        />
                        Select All
                    </label>
                    {(allBlocks || []).map((b) => {
                        const checked = activeBlocks.includes(b);
                        return (
                            <label style={{marginLeft: '8px'}}>
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e: any) => {
                                        const isChecked = (e.target as HTMLInputElement).checked;
                                        setActiveBlocks((prev) => {
                                            const set = new Set(prev);
                                            isChecked ? set.add(b) : set.delete(b);
                                            return Array.from(set);
                                        });
                                    }}
                                />
                                {b}
                            </label>
                        );
                    })}
                </div>
            </div>
            {/* ROW 5: Page size */}
            <div style={{marginBottom: '12px'}}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{fontWeight: 600}}>Page size:</span>
                    <select
                        value={String(pageSize)}
                        onChange={(e: any) =>
                            setPageSize(
                                parseInt((e.target as HTMLSelectElement).value, 10)
                            )
                        }
                    >
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </label>
            </div>
            </div>
            </div>
            {!loading && loadError && (
                <div
                    style={{
                        margin: '12px 0',
                        padding: '10px 12px',
                        border: '1px solid #e53935',
                        background: '#fff5f5',
                        color: '#d32f2f',
                        borderRadius: '6px'
                    }}
                    role="alert"
                >
                    {loadError}
                </div>
            )}
            {loading ? (
                <div style="display:flex; justify-content:center; align-items:center; min-height:200px;">
                    <oj-progress-circle size="md" value={-1} />
                </div>
            ) : (
                <div>
                    {showOnlyGpuRacks && (
                        <div class="project-details-header-action-row" aria-hidden="true">
                            <div class="project-details-header-action-spacer project-details-header-action-spacer-wide"></div>
                            <div class="project-details-header-action-cell">
                                {validationReadyRefreshButton}
                            </div>
                            <div class="project-details-header-action-spacer project-details-header-action-spacer-tail"></div>
                        </div>
                    )}
                    <oj-table
                        selectionMode={INIT_SELECTION_MODE}
                        selected={{ row: selectedRowKeySet, column: emptyColumnKeySet }}
                        onselectedChanged={onSelectionChangedHandler}
                        class="selectable-table oj-table oj-table-hover oj-table-responsive"
                        aria-label="Projects Details Table"
                        id="projectDetailsTable"
                        columns={rackColumns}
                        data={pagingDataProvider as any}
                        accessibility={ACC}
                    >
                        <template slot="validationReadyTemplate" render={validationReadyTemplate} />
                        <template slot="hostCountTemplate" render={hostCountTemplate} />
                        <template slot="validationStatusTemplate" render={validationStatusTemplate} />
                    </oj-table>
                    <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
                        <oj-paging-control
                            data={pagingDataProvider as any}
                            page-size={pageSize}
                        ></oj-paging-control>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectDetailsContainer;
