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

const RACK_COLUMNS = [
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

const API_URL = window.location.host.includes('localhost') ? "http://localhost:21000/lvv" : `https://${window.location.host}/lvv`;

interface ProjectRackRow {
    _key: string;
    building: string;
    block: string;
    rackLocation: string;
    rackSerialNumber: string;
    isGpuRack?: boolean;
    gpuRackLabel?: string;
    ticketType?: string;
    ticketId?: string;
    resolveEnabled?: boolean;
    resolveDisabledReason?: string;
    rackState?: string;
    platformName?: string;
}

type RackValidationSummary = {
    isValidated: boolean;
    cableFailures: number;
    opticsFailures: number;
    deviceFailures: number;
};

type RackStatusToken = {
    className: string;
    label: string;
    title: string;
};

type JsonRecord = Record<string, unknown>;

const NOT_VALIDATED_SUMMARY: RackValidationSummary = {
    isValidated: false,
    cableFailures: 0,
    opticsFailures: 0,
    deviceFailures: 0,
};

async function fetchWithRetry(url: string, options: any = {}, maxAttempts: number = 3, delayMs: number = 1000): Promise<Response> {
    const signal: AbortSignal | undefined = options?.signal;
    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }
        try {
            const response = await fetch(url, options);
            // Retry for network errors or 5xx; accept 404, 400, etc. as non-retryable (customize as needed)
            if (!response.ok && response.status >= 500) {
                throw new Error(`Server error: ${response.status}`);
            }
            return response; // Success!
        } catch (err) {
            // If aborted, stop retrying immediately
            if (signal?.aborted) {
                throw err;
            }
            lastError = err;
            if (attempt < maxAttempts - 1) {
                await new Promise(res => setTimeout(res, delayMs));
            }
        }
    }
    throw lastError;
}

function asRecord(value: unknown): JsonRecord | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as JsonRecord;
    }
    return null;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function summarizeLegacyValidationRows(rows: unknown[]): RackValidationSummary {
    if (rows.length === 0) {
        return NOT_VALIDATED_SUMMARY;
    }

    let cableFailures = 0;
    let opticsFailures = 0;
    let deviceFailures = 0;

    rows.forEach((rawRow) => {
        const row = asRecord(rawRow);
        if (!row) {
            return;
        }

        const linkStatus = String(row["lldpStatus"] ?? row["linkStatus"] ?? "")
            .trim()
            .toUpperCase();
        if (linkStatus !== "" && linkStatus !== "PASS" && linkStatus !== "UNSUPPORTED") {
            cableFailures += 1;
        }

        const hasOptics =
            String(row["txPower"] ?? "").trim() !== "" || String(row["rxPower"] ?? "").trim() !== "";
        if (hasOptics) {
            opticsFailures += 1;
        }

        const psuFailure = String(row["psuFailure"] ?? "").trim().toLowerCase();
        if (psuFailure !== "" && psuFailure !== "null" && psuFailure !== "pass") {
            deviceFailures += 1;
        }
    });

    return {
        isValidated: true,
        cableFailures,
        opticsFailures,
        deviceFailures,
    };
}

function summarizeValidationPayload(payload: unknown, rackSerial: string): RackValidationSummary {
    if (Array.isArray(payload)) {
        return summarizeLegacyValidationRows(payload);
    }

    const payloadRecord = asRecord(payload);
    if (!payloadRecord) {
        return NOT_VALIDATED_SUMMARY;
    }

    let rackNode: unknown = payloadRecord[rackSerial];
    if (!rackNode) {
        const keys = Object.keys(payloadRecord);
        if (keys.length === 1) {
            rackNode = payloadRecord[keys[0]];
        }
    }

    const rackRecord = asRecord(rackNode);
    if (!rackRecord) {
        return NOT_VALIDATED_SUMMARY;
    }

    const deviceResults = Object.values(rackRecord)
        .map((value) => asRecord(value))
        .filter((value): value is JsonRecord => value !== null);

    if (deviceResults.length === 0) {
        return NOT_VALIDATED_SUMMARY;
    }

    const cableFailures = deviceResults.reduce((sum, result) => {
        return (
            sum +
            asArray(result["LLDP Errors"]).length +
            asArray(result["Interface Errors"]).length
        );
    }, 0);

    const opticsFailures = deviceResults.reduce((sum, result) => {
        return (
            sum +
            asArray(result["Optic Errors"]).length +
            asArray(result["FEC_BER Errors"]).length
        );
    }, 0);

    const deviceFailures = deviceResults.reduce((sum, result) => {
        return (
            sum +
            asArray(result["Power Errors"]).length +
            asArray(result["Fan Errors"]).length
        );
    }, 0);

    return {
        isValidated: true,
        cableFailures,
        opticsFailures,
        deviceFailures,
    };
}

function buildRackStatusTokens(summary: RackValidationSummary): RackStatusToken[] {
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

    if (summary.deviceFailures > 0) {
        tokens.push({
            className: "rack-status-chip device-failure",
            label: `DEVICE:${summary.deviceFailures}`,
            title: `${summary.deviceFailures} device validation failure${summary.deviceFailures === 1 ? "" : "s"}`,
        });
    }

    return tokens;
}

function renderRackStatus(summary: RackValidationSummary | undefined) {
    if (!summary) {
        return <span class="rack-status-text muted">Loading...</span>;
    }

    return (
        <span class="rack-status-cell">
            {buildRackStatusTokens(summary).map((token) => (
                <span key={token.label} class={token.className} title={token.title}>
                    {token.label}
                </span>
            ))}
        </span>
    );
}

async function fetchRackStatusSummary(
    row: ProjectRackRow,
    region: string,
    signal: AbortSignal
): Promise<RackValidationSummary> {
    if (!row.rackSerialNumber || !region) {
        return NOT_VALIDATED_SUMMARY;
    }

    const validationUrl = new URL(`${API_URL}/cablingValidation`);
    validationUrl.searchParams.set("regionName", region);
    validationUrl.searchParams.set("rackSerialNumber", row.rackSerialNumber);

    const response = await fetchWithRetry(validationUrl.href, { method: "GET", signal });
    if (!response.ok) {
        return NOT_VALIDATED_SUMMARY;
    }

    const body = await response.text();
    if (!body.trim()) {
        return NOT_VALIDATED_SUMMARY;
    }

    try {
        const payload: unknown = JSON.parse(body);
        return summarizeValidationPayload(payload, row.rackSerialNumber);
    } catch {
        return NOT_VALIDATED_SUMMARY;
    }
}

const ProjectDetailsContainer = (props: Props) => {

    const [allProjectData, setAllProjectData] = useState<ProjectRackRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [rackStatusByKey, setRackStatusByKey] = useState<Record<string, RackValidationSummary | undefined>>({});

    const [activeBlocks, setActiveBlocks] = useState<string[]>([]);
    const [searchText, setSearchText] = useState("");
    const [hideMissingSerial, setHideMissingSerial] = useState(false);
    const [pageSize, setPageSize] = useState<number>(25);
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
                const normalized: ProjectRackRow[] = (rows || []).map((r) => ({
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
    }, [props.project, props.region, props.projectLoadMeasurement]);

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

    useEffect(() => {
        const ac = new AbortController();
        const requestId = ++statusRequestSeqRef.current;

        if (!props.project?.projectId || allProjectData.length === 0) {
            setRackStatusByKey({});
            return () => ac.abort();
        }

        const nextStatuses: Record<string, RackValidationSummary | undefined> = {};
        allProjectData.forEach((row) => {
            nextStatuses[row._key] = row.rackSerialNumber ? undefined : NOT_VALIDATED_SUMMARY;
        });
        setRackStatusByKey(nextStatuses);

        const rowsToFetch = allProjectData.filter(
            (row) => row.rackSerialNumber && row.rackSerialNumber.trim() !== ""
        );

        void Promise.all(
            rowsToFetch.map(async (row) => {
                try {
                    const summary = await fetchRackStatusSummary(row, props.region, ac.signal);
                    return [row._key, summary] as const;
                } catch (e) {
                    if ((e as any)?.name === 'AbortError') {
                        return null;
                    }
                    return [row._key, NOT_VALIDATED_SUMMARY] as const;
                }
            })
        ).then((entries) => {
            if (ac.signal.aborted || requestId !== statusRequestSeqRef.current) {
                return;
            }

            const resolvedStatuses = { ...nextStatuses };
            entries.forEach((entry) => {
                if (!entry) {
                    return;
                }
                const [key, summary] = entry;
                resolvedStatuses[key] = summary;
            });
            setRackStatusByKey(resolvedStatuses);
        });

        return () => ac.abort();
    }, [allProjectData, props.project, props.region]);

    const filteredRows = useMemo((): ProjectRackRow[] => {
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

        return rows;
    }, [activeBlocks, allProjectData, hideMissingSerial, searchText, includeInServiceRacks, showOnlyGpuRacks]);

    const baseDataProvider = useMemo(
        () => new ArrayDataProvider(filteredRows, { keyAttributes: "_key" }),
        [filteredRows]
    );
    const pagingDataProvider = useMemo(
        () => new PagingDataProviderView(baseDataProvider),
        [baseDataProvider]
    );


    // Reset paging when filters change or page size changes
    useEffect(() => {
        (pagingDataProvider as any).setPage(0, { pageSize });
    }, [pagingDataProvider, pageSize, searchText, hideMissingSerial, activeBlocks, includeInServiceRacks, showOnlyGpuRacks]);

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
        return renderRackStatus(rackStatusByKey[row._key]);
    };

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
                        placeholder="Search rack location / platform / block / serial / type / ticket"
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
                    <oj-table
                        selectionMode={INIT_SELECTION_MODE}
                        selected={{ row: selectedRowKeySet, column: emptyColumnKeySet }}
                        onselectedChanged={onSelectionChangedHandler}
                        class="selectable-table oj-table oj-table-hover oj-table-responsive"
                        aria-label="Projects Details Table"
                        id="projectDetailsTable"
                        columns={RACK_COLUMNS}
                        data={pagingDataProvider as any}
                        accessibility={ACC}
                    >
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
