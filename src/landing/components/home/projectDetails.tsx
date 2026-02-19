import { h } from "preact";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import PagingDataProviderView = require("ojs/ojpagingdataproviderview");
import { useEffect, useMemo, useState, useRef } from "preact/hooks";
import "ojs/ojtable";
import { TableIntrinsicProps, ojTable } from "ojs/ojtable";
import { KeySetImpl } from "ojs/ojkeyset";
import "ojs/ojprogress-circle";
import "ojs/ojpagingcontrol";

const RACK_COLUMNS = [
    { headerText: "Rack Location", field: "rackLocation", id: "rackLocation", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Block", field: "block", id: "block", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Rack Serial Number", field: "rackSerialNumber", id: "rackSerialNumber", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Issue(s) Type", field: "ticketType", id: "ticketType", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Ticket", field: "ticketId", id: "ticketId", resizable: "enabled" as const, sortable: 'enabled' as const },
    { headerText: "Rack State", field: "rackState", id: "rackState", resizable: "enabled" as const, sortable: 'enabled' as const }
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
    ticketType?: string;
    ticketId?: string;
    resolveEnabled?: boolean;
    resolveDisabledReason?: string;
    rackState?: string;
    platformName?: string;
}

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

const ProjectDetailsContainer = (props: Props) => {

    const [allProjectData, setAllProjectData] = useState<ProjectRackRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [activeBlocks, setActiveBlocks] = useState<string[]>([]);
    const [searchText, setSearchText] = useState("");
    const [hideMissingSerial, setHideMissingSerial] = useState(false);
    const [pageSize, setPageSize] = useState<number>(25);
    const requestSeqRef = useRef(0);
    const [showAvailable, setShowAvailable] = useState(false);
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
                const normalized: ProjectRackRow[] = (rows || []).map((r, idx) => ({
                    ...r,
                    _key: `${r.block ?? ''}|${r.rackLocation ?? ''}`
                }));
                if (fetchId === requestSeqRef.current) {
                    setAllProjectData(normalized);
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
    }, [props.project, props.region]);

    const filteredRows = useMemo((): ProjectRackRow[] => {
        if (activeBlocks.length === 0) {
            return [];
        }

        let rows = allProjectData.filter((row) => row.block && activeBlocks.includes(row.block));

        if (!showAvailable) {
            rows = rows.filter((row) => (row.rackState || '').toUpperCase() !== 'AVAILABLE');
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
                    row.ticketType || "",
                    row.ticketId || "",
                    row.rackState || "",
                    row.platformName
                ].join(" ").toLowerCase();
                return haystack.includes(q);
            });
        }

        return rows;
    }, [activeBlocks, allProjectData, hideMissingSerial, searchText, showAvailable]);

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
    }, [pagingDataProvider, pageSize, searchText, hideMissingSerial, activeBlocks, showAvailable]);

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
                        placeholder="Search rack location / block / serial / type / ticket"
                        onInput={(e: any) =>
                            setSearchText((e.target as HTMLInputElement).value)
                        }
                        style="min-width: 320px;"
                    />
                </label>
            </div>
            {/* ROW 2: Hide missing serial + Block filters */}
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{display:'flex', alignItems : 'center', gap: '8px' }}>
                    <input
                        type="checkbox"
                        checked={showAvailable}
                        onChange={(e: any) => setShowAvailable((e.target as HTMLInputElement).checked)}
                    />
                    Include in-service racks
                </label>
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
            {/* ROW 3: Page size */}
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
