import { h } from 'preact';
import "./style.scss";
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import 'oj-c/button';
import 'oj-c/input-text';
import 'oj-c/table';
import 'oj-c/tab-bar';
import "oj-c/input-text";
import "ojs/ojdrawerpopup";
import {
    createDefaultQcWorkOrderListQuery,
    useListQcWorkOrders
} from "../api/hooks/qcApi";
import type { QcWorkOrderListQuery } from "../api/hooks/qcApi";
import { WorkOrderListLayout } from "./WorkOrderListLayout";
import { toWorkOrderStatusFilterValue } from "../workOrderStatus";

const formatTimestamp = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);

const formatWorkOrderUpdatedDate = (value?: string) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
        return "";
    }

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("/");
};

type WorkOrderListContainerProps = {
    onOpenDetail?: (id: string) => void;
    initialSiteName?: string;
    vendorName?: string;
};

export const WorkOrderListContainer = ({ onOpenDetail, initialSiteName, vendorName }: WorkOrderListContainerProps) => {
    const [errors, setErrors] = useState<any[]>([]);
    const [refreshRequested, setRefreshRequested] = useState(false);
    const [refreshInProgress, setRefreshInProgress] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(() =>
        formatTimestamp(new Date())
    );
    const [drawerOpened, setDrawerOpened] = useState(false);
    const [query, setQuery] = useState<QcWorkOrderListQuery>(
        createDefaultQcWorkOrderListQuery
    );

    const {
        data: workOrders,
        isFetching: workOrdersFetching,
        isPending: workOrdersPending,
        refetch: refetchWorkOrders,
        error: workOrdersError,
        hasNextPage,
        loadNextPage,
    } = useListQcWorkOrders({ query });

    const workOrdersLoading = workOrdersFetching && workOrdersPending;

    useEffect(() => {
        const nextErrors = [];
        if (workOrdersError) {
            nextErrors.push("Failed to load work orders");
        }
        setErrors(nextErrors);
    }, [workOrdersError]);

    useEffect(() => {
        if (workOrders && !workOrdersLoading && lastUpdated === null) {
            setLastUpdated(formatTimestamp(new Date()));
        }
    }, [workOrders, workOrdersLoading, lastUpdated]);

    useEffect(() => {
        if (!refreshRequested) return;

        let cancelled = false;

        const doRefresh = async () => {
            try {
                setRefreshInProgress(true);
                await refetchWorkOrders();
                if (!cancelled) {
                    setLastUpdated(formatTimestamp(new Date()));
                }
            } catch (e) {
                console.error("Failed to refresh work orders", e);
            } finally {
                if (!cancelled) {
                    setRefreshRequested(false);
                    setRefreshInProgress(false);
                }
            }
        };

        void doRefresh();
        return () => {
            cancelled = true;
        };
    }, [refreshRequested, refetchWorkOrders]);

    const handleRefresh = () => {
        setRefreshRequested(true);
    };

    const handleLoadMore = useCallback(() => {
        if (!hasNextPage || workOrdersFetching) {
            return;
        }

        void loadNextPage();
    }, [hasNextPage, loadNextPage, workOrdersFetching]);

    const handleQueryChange = useCallback((nextQuery: QcWorkOrderListQuery) => {
        setQuery(nextQuery);
        setLastUpdated(null);
    }, []);

    const effectiveLoading = workOrdersLoading || refreshInProgress;
    const loadingMoreWorkOrders =
        workOrdersFetching && !workOrdersPending && !refreshInProgress;
    const statusFilterValue = toWorkOrderStatusFilterValue(query.filters.lifecycleState);
    const filteredWorkOrderItems = useMemo(() => {
        const items = workOrders?.items ?? [];
        const exactIdFilter = query.clientFilters?.id;
        const exactLastUpdatedFilter = query.clientFilters?.timeUpdated;

        return items.filter((workOrder) => {
            if (statusFilterValue
                && toWorkOrderStatusFilterValue(workOrder.lifecycleState) !== statusFilterValue) {
                return false;
            }

            if (exactIdFilter && workOrder.id !== exactIdFilter) {
                return false;
            }

            if (exactLastUpdatedFilter
                && formatWorkOrderUpdatedDate(workOrder.timeUpdated) !== exactLastUpdatedFilter) {
                return false;
            }

            return true;
        });
    }, [query.clientFilters?.id, query.clientFilters?.timeUpdated, statusFilterValue, workOrders?.items]);

    return (
        <WorkOrderListLayout
            workOrders={filteredWorkOrderItems as any}
            loading={effectiveLoading}
            loadingMore={loadingMoreWorkOrders}
            hasMore={hasNextPage}
            lastUpdated={lastUpdated}
            errors={errors}
            drawerOpened={drawerOpened}
            initialSiteName={initialSiteName}
            vendorName={vendorName}
            onOpenDetail={onOpenDetail}
            onRefresh={handleRefresh}
            onLoadMore={handleLoadMore}
            query={query}
            onQueryChange={handleQueryChange}
            onOpenDrawer={() => setDrawerOpened(true)}
            onCloseDrawer={() => setDrawerOpened(false)}
            onClearErrors={() => setErrors([])}
        />
    );
};
