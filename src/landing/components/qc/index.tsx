import { useEffect, useState } from "preact/hooks";

import {WorkOrderListContainer} from "./components/WorkOrderListContainer";
import {WorkOrderDetailView} from "./components/WorkOrderDetailView";
import {WorkOrderWorkflowView} from "./components/WorkOrderWorkflowView";

type QcProps = {
    page?: string;
    onPageChanged?: (value: any) => void;
    selectedSiteName?: string;
    vendorName?: string;
};

type QcRouteState = {
    workOrderId: string | null;
    view: "list" | "detail" | "workflow";
};

type CloseWorkflowOptions = {
    replaceHistory?: boolean;
};

export const USE_MOCK_QC_API = false;

const getRouteFromPath = (): QcRouteState => {
    const workflowMatch = window.location.pathname.match(/^\/qc\/([^/]+)\/workflow\/?$/);
    if (workflowMatch?.[1]) {
        return {
            workOrderId: decodeURIComponent(workflowMatch[1]),
            view: "workflow"
        };
    }

    const detailMatch = window.location.pathname.match(/^\/qc\/([^/]+)\/?$/);
    if (detailMatch?.[1]) {
        return {
            workOrderId: decodeURIComponent(detailMatch[1]),
            view: "detail"
        };
    }

    return {
        workOrderId: null,
        view: "list"
    };
};

const Qc = ({ selectedSiteName, vendorName }: QcProps) => {
    const [routeState, setRouteState] = useState<QcRouteState>(() => getRouteFromPath());

    useEffect(() => {
        const syncFromUrl = () => {
            setRouteState(getRouteFromPath());
        };

        window.addEventListener("popstate", syncFromUrl);
        return () => window.removeEventListener("popstate", syncFromUrl);
    }, []);

    const openDetail = (id: string) => {
        setRouteState({ workOrderId: id, view: "detail" });
        window.history.pushState({}, "", `/qc/${encodeURIComponent(id)}`);
    };

    const openWorkflow = (id: string) => {
        setRouteState({ workOrderId: id, view: "workflow" });
        window.history.pushState({}, "", `/qc/${encodeURIComponent(id)}/workflow`);
    };

    const closeDetail = () => {
        setRouteState({ workOrderId: null, view: "list" });
        window.history.pushState({}, "", "/qc");
    };

    const closeWorkflow = (options: CloseWorkflowOptions = {}) => {
        if (!routeState.workOrderId) {
            closeDetail();
            return;
        }

        setRouteState({ workOrderId: routeState.workOrderId, view: "detail" });
        const detailPath = `/qc/${encodeURIComponent(routeState.workOrderId)}`;
        if (options.replaceHistory) {
            window.history.replaceState({}, "", detailPath);
        } else {
            window.history.pushState({}, "", detailPath);
        }
    };

    if (routeState.workOrderId && routeState.view === "workflow") {
        return (
            <WorkOrderWorkflowView
                workOrderId={routeState.workOrderId}
                vendorName={vendorName}
                onBackToList={closeDetail}
                onBackToDetail={closeWorkflow}
            />
        );
    }

    if (routeState.workOrderId) {
        return (
            <WorkOrderDetailView
                workOrderId={routeState.workOrderId}
                onBack={closeDetail}
                onBeginWorkflow={() => openWorkflow(routeState.workOrderId as string)}
            />
        );
    }

    return <>
        <WorkOrderListContainer
            onOpenDetail={openDetail}
            initialSiteName={selectedSiteName}
            vendorName={vendorName}
        />
    </>;
};

export default Qc;
