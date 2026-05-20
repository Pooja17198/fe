import { h, FunctionalComponent } from 'preact';
import 'oj-c/button';
import 'oj-c/table';
import 'oj-c/dialog';
import 'oj-c/progress-circle';

import { WorkOrderListView } from './WorkOrderListView';
import { WorkOrderFilters } from './WorkOrderFilters';
import ToastMessage from '../../cabling/components/ToastMessage';
import { CreateWorkOrderDrawer } from './CreateWorkOrderDrawer';
import type { QcWorkOrderListQuery } from '../api/hooks/qcApi';

type WorkOrderListLayoutProps = {
    workOrders: any[] | undefined;
    loading: boolean;
    loadingMore: boolean;
    hasMore: boolean;
    lastUpdated: string | null;
    errors: string[];
    drawerOpened: boolean;
    initialSiteName?: string;
    vendorName?: string;
    query: QcWorkOrderListQuery;
    onOpenDetail?: (id: string) => void;
    onRefresh: () => void;
    onLoadMore: () => void;
    onQueryChange: (query: QcWorkOrderListQuery) => void;
    onOpenDrawer: () => void;
    onCloseDrawer: () => void;
    onClearErrors: () => void;
};


export const WorkOrderListLayout: FunctionalComponent<WorkOrderListLayoutProps> =
    ({
         workOrders,
         loading,
         loadingMore,
         hasMore,
         lastUpdated,
         errors,
         drawerOpened,
         initialSiteName,
         vendorName,
         query,
         onOpenDetail,
         // roomInfo,
         onRefresh,
         onLoadMore,
         onQueryChange,
         onOpenDrawer,
         onCloseDrawer,
         onClearErrors
     }) => (
        <div className="oj-web-applayout-max-width oj-web-applayout-content qc-work-orders-page">
            <div className="wo-header">
                <h1 className="wo-page-title">Quality Control</h1>
                <div className="last-updated">
                    <span className="last-updated-label">Last Updated {lastUpdated ?? ""}</span>
                    <oj-c-button
                        id="refreshBtn"
                        chroming="solid"
                        size="sm"
                        display="icons"
                        label="Refresh"
                        disabled={loading}
                        onojAction={onRefresh}
                    >
                        <span slot="startIcon" class="oj-ux-ico-refresh" />
                    </oj-c-button>
                </div>
            </div>

            <div className="section-header">
                <h4>Work Order List</h4>
            </div>

            <div className="wo-divider" />

            <div className="wo-toolbar">
                <div className="create-workflow">
                    <oj-c-button
                        id="createWorkflowBtn"
                        chroming="outlined"
                        display="all"
                        label="Create Work Order"
                        onojAction={onOpenDrawer}
                    >
                        <span slot="startIcon" className="oj-ux-ico-plus" />
                    </oj-c-button>
                </div>
            </div>

            <div slot="body" className="oj-helper-text-align-center">
                <div className="work-order-list-container">
                    <WorkOrderFilters
                        query={query}
                        disabled={loading || loadingMore}
                        onQueryChange={onQueryChange}
                    />
                    <WorkOrderListView
                        workOrders={workOrders as any}
                        assigneeFilter={query.clientFilters?.assignee}
                        loading={loading}
                        loadingMore={loadingMore}
                        hasMore={hasMore}
                        onOpenDetail={onOpenDetail}
                        onLoadMore={onLoadMore}
                        resetScrollKey={query}
                    />
                </div>

                <oj-c-dialog
                    opened={loading}
                    id="modalDialogLoading"
                    aria-describedby="desc"
                >
                    <div slot="body" className="oj-helper-text-align-center">
                        <oj-c-progress-circle
                            aria-labelledby="lgLabel indetLabel"
                            size="lg"
                            value={-1}
                        ></oj-c-progress-circle>
                        <h4 className="oj-md-padding-5x-vertical">
                            Fetching Work Orders...
                        </h4>
                    </div>
                </oj-c-dialog>
            </div>

            <CreateWorkOrderDrawer
                opened={drawerOpened}
                initialSiteName={initialSiteName}
                vendorName={vendorName}
                onClose={onCloseDrawer}
                onCreate={onRefresh}
            />

            <ToastMessage
                messageList={errors.map((error) => ({
                    summary: error,
                    detail: '',
                    severity: 'error'
                }))}
                position="top"
                onClose={onClearErrors}
            />
        </div>
    );
