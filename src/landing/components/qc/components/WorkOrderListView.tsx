import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import {h} from "preact";
import { getQcTaskAssignedTo, listFirstQcWorkOrderTask } from "../api/hooks/qcApi";
import { getWorkOrderStatusLabel } from "../workOrderStatus";

const WO_LIST_COLUMNS = [
    {
        headerText: "Title",
        field: "displayName", id: "displayName",
        template: "displayNameCellTemplate",
        resizable: "enabled" as const,
        sortable: 'enabled' as const,
        headerClassName: 'col-header col-header-id',
        className: 'col-id',
        maxWidth: "300px",
        minWidth: "300px"

    },
    {
        headerText: "Room",
        field: "room",
        id: "room",
        template: "roomCellTemplate",
        resizable: "enabled" as const,
        sortable: 'enabled' as const,
        headerClassName: 'col-header',
        className: 'col-room',
        maxWidth: "150px",
        minWidth: "150px"

    },
    {
        headerText: "Rack",
        field: "rack",
        id: "rack",
        template: "rackCellTemplate",
        resizable: "disabled" as const,
        sortable: 'enabled' as const,
        headerClassName: 'col-rack',
        maxWidth: "150px",
        minWidth: "150px"

    },
    {
        headerText: "Created By",
        field: "createdBy",
        id: "createdBy",
        template: "createdByCellTemplate",
        resizable: "disabled" as const,
        sortable: 'enabled' as const,
        headerClassName: 'col-header'
    },
    {
        headerText: "Assignee",
        field: "assignee",
        id: "assignee",
        template: "assigneeCellTemplate",
        resizable: "enabled" as const,
        sortable: 'enabled' as const,
        headerClassName: 'col-header'
    },
    {
        headerText: "Last Updated",
        field: "lastUpdated",
        id: "lastUpdated",
        template: "lastUpdatedCellTemplate",
        resizable: "enabled" as const,
        sortable: 'enabled' as const,
        headerClassName: 'col-header',
        className: 'col-last-updated'
    },
    {
        headerText: "Task Status",
        field: "taskStatus",
        id: "taskStatus",
        template: "taskStatusCellTemplate",
        resizable: "enabled" as const,
        sortable: 'enabled' as const,
        headerClassName: 'col-header'
    }
];
type QcWorkOrder = {
    id: string;
    workOrderDefinitionId: string;
    displayName: string;
    timeCreated: string;
    timeUpdated: string;
    regionId: string;
    buildingId: string;
    dataHallId: string;
    roomId: string;
    rackLocationId: string;
    createdBy: string;
    vendorName: string | null;
    lifecycleState: string;
};

type QcWorkOrderCollection = QcWorkOrder[];

interface WOListViewProps {
    workOrders: QcWorkOrderCollection | undefined;
    assigneeFilter?: string;
    loading: boolean;
    loadingMore: boolean;
    hasMore: boolean;
    resetScrollKey?: unknown;
    onOpenDetail?: (id: string) => void;
    onLoadMore: () => void;
}

type WorkOrderRow = {
    displayName: string;
    room: string;
    rack: string;
    createdBy: string;
    lastUpdated: string;
    taskStatus: string;
};

type AssigneeCellProps = {
    workOrderId: string;
    value?: string;
    loadAssignee: (workOrderId: string) => Promise<string>;
};

const AssigneeCell = ({ workOrderId, value, loadAssignee }: AssigneeCellProps) => {
    const [assignee, setAssignee] = useState(value || "");

    useEffect(() => {
        setAssignee(value || "");
    }, [value, workOrderId]);

    useEffect(() => {
        if (assignee || !workOrderId) {
            return;
        }

        let isActive = true;
        void loadAssignee(workOrderId).then((nextAssignee) => {
            if (isActive) {
                setAssignee(nextAssignee);
            }
        });

        return () => {
            isActive = false;
        };
    }, [assignee, loadAssignee, workOrderId]);

    if (!assignee) {
        return (
            <span
                className="wo-assignee-loading-bar"
                role="progressbar"
                aria-label="Loading assignee"
                title="Loading assignee"
            />
        );
    }

    return <span>{assignee}</span>;
};

export const WorkOrderListView = ({
    workOrders,
    assigneeFilter,
    loading,
    loadingMore,
    hasMore,
    resetScrollKey,
    onOpenDetail,
    onLoadMore
}: WOListViewProps) => {
    const tableWrapperRef = useRef<HTMLDivElement | null>(null);
    const isMountedRef = useRef(true);
    const assigneesByWorkOrderIdRef = useRef<Record<string, string>>({});
    const pendingAssigneeRequestsRef = useRef<Record<string, Promise<string>>>({});
    const [assigneesByWorkOrderId, setAssigneesByWorkOrderId] = useState<Record<string, string>>({});

    useEffect(() => {
        tableWrapperRef.current?.scrollTo({ top: 0 });
    }, [resetScrollKey]);

    useEffect(() => () => {
        isMountedRef.current = false;
    }, []);

    useEffect(() => {
        assigneesByWorkOrderIdRef.current = assigneesByWorkOrderId;
    }, [assigneesByWorkOrderId]);

    const loadAssignee = useCallback((workOrderId: string) => {
        const cachedAssignee = assigneesByWorkOrderIdRef.current[workOrderId];
        if (cachedAssignee) {
            return Promise.resolve(cachedAssignee);
        }

        const pendingRequest = pendingAssigneeRequestsRef.current[workOrderId];
        if (pendingRequest) {
            return pendingRequest;
        }

        const request = listFirstQcWorkOrderTask(workOrderId)
            .then((task) => getQcTaskAssignedTo(task) || "Not Assigned")
            .catch((error) => {
                console.error("Failed to load work order task assignee", {
                    workOrderId,
                    error
                });
                return "Unavailable";
            })
            .then((nextAssignee) => {
                if (isMountedRef.current) {
                    setAssigneesByWorkOrderId((current) => ({
                        ...current,
                        [workOrderId]: nextAssignee
                    }));
                }
                delete pendingAssigneeRequestsRef.current[workOrderId];
                return nextAssignee;
            });

        pendingAssigneeRequestsRef.current[workOrderId] = request;
        return request;
    }, []);

    const rows = useMemo(
        () =>
            (workOrders ?? []).map((wo) => {
                const date = wo.timeUpdated ? new Date(wo.timeUpdated) : null;

                const formattedDate = date
                    ? [
                        date.getFullYear(),
                        String(date.getMonth() + 1).padStart(2, "0"),
                        String(date.getDate()).padStart(2, "0")
                    ].join("/")
                    : "";

                return {
                    id: wo.id,
                    displayName: wo.displayName,
                    room: wo.roomId,
                    rack: wo.rackLocationId,
                    createdBy: wo.createdBy,
                    lastUpdated: formattedDate,
                    taskStatus: getWorkOrderStatusLabel(wo.lifecycleState)
                };
            }),
        [workOrders]
    );

    const normalizedAssigneeFilter = assigneeFilter?.trim();
    const effectiveRows = useMemo(() => {
        if (loading) {
            return [];
        }

        if (!normalizedAssigneeFilter) {
            return rows;
        }

        return rows.filter((row) => {
            const assignee = assigneesByWorkOrderId[row.id];
            return !assignee || assignee === normalizedAssigneeFilter;
        });
    }, [assigneesByWorkOrderId, loading, normalizedAssigneeFilter, rows]);
    const dataProvider = useMemo(
        () => new ArrayDataProvider(effectiveRows, { keyAttributes: "id" }),
        [effectiveRows]
    );

    const maybeLoadMore = useCallback(() => {
        const element = tableWrapperRef.current;
        if (!element || loading || loadingMore || !hasMore) {
            return;
        }

        const distanceFromBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight;
        if (distanceFromBottom <= 96) {
            onLoadMore();
        }
    }, [hasMore, loading, loadingMore, onLoadMore]);

    useEffect(() => {
        maybeLoadMore();
    }, [effectiveRows.length, maybeLoadMore]);

    const createCellTemplate = (field: keyof WorkOrderRow) => (context: any) => {
        const row = (context?.item && context.item.data) || {};
        const value = String(row[field] ?? "");
        return <span>{value}</span>;
    };

    const displayNameCellTemplate = (context: any) => {
        const row = (context?.item && context.item.data) || {};
        const value = String(row.displayName ?? "");

        return (
            <button
                type="button"
                className="wo-id-link"
                onClick={() => onOpenDetail?.(row.id)}
            >
                {value}
            </button>
        );
    };
    const roomCellTemplate = createCellTemplate("room");
    const rackCellTemplate = createCellTemplate("rack");
    const createdByCellTemplate = createCellTemplate("createdBy");
    const assigneeCellTemplate = (context: any) => {
        const row = (context?.item && context.item.data) || {};
        const workOrderId = String(row.id ?? "");

        return (
            <AssigneeCell
                workOrderId={workOrderId}
                value={assigneesByWorkOrderId[workOrderId]}
                loadAssignee={loadAssignee}
            />
        );
    };
    const lastUpdatedCellTemplate = createCellTemplate("lastUpdated");
    const taskStatusCellTemplate = createCellTemplate("taskStatus");

    return (
        <div className="wo-list-view">
            <div
                className="wo-table-wrapper"
                ref={tableWrapperRef}
                onScroll={maybeLoadMore}
            >
                <oj-table
                    class="wo-table-container"
                    columns={WO_LIST_COLUMNS}
                    data={dataProvider as any}
                >
                    <template slot="displayNameCellTemplate" render={displayNameCellTemplate} />
                    <template slot="roomCellTemplate" render={roomCellTemplate} />
                    <template slot="rackCellTemplate" render={rackCellTemplate} />
                    <template slot="createdByCellTemplate" render={createdByCellTemplate} />
                    <template slot="assigneeCellTemplate" render={assigneeCellTemplate} />
                    <template slot="lastUpdatedCellTemplate" render={lastUpdatedCellTemplate} />
                    <template slot="taskStatusCellTemplate" render={taskStatusCellTemplate} />
                </oj-table>
                {loadingMore && (
                    <div className="wo-load-more-status">Loading more work orders...</div>
                )}
            </div>
        </div>
    );
};
