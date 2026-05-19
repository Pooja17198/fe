import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import "oj-c/button";
import "oj-c/dialog";
import "oj-c/input-text";
import "oj-c/select-single";
import type {
    ListQcWorkOrderClientFilters,
    ListQcWorkOrderFilters,
    QcWorkOrderListQuery
} from "../api/hooks/qcApi";
import {
    WORK_ORDER_STATUS_SELECT_OPTIONS,
    toWorkOrderStatusFilterValue
} from "../workOrderStatus";

type WorkOrderFiltersProps = {
    query: QcWorkOrderListQuery;
    disabled: boolean;
    onQueryChange: (query: QcWorkOrderListQuery) => void;
};

type FilterColumnKey =
    | "id"
    | "lifecycleState"
    | "timeUpdated"
    | "assignee"
    | "roomId"
    | "rackLocationId"
    | "createdBy";

type FilterColumnOption = {
    value: FilterColumnKey;
    label: string;
};

const FILTER_COLUMN_OPTIONS: FilterColumnOption[] = [
    { value: "id", label: "ID" },
    { value: "lifecycleState", label: "Status" },
    { value: "timeUpdated", label: "Last Updated" },
    { value: "assignee", label: "Assignee" },
    { value: "roomId", label: "Room" },
    { value: "rackLocationId", label: "Rack" },
    { value: "createdBy", label: "Created By" }
];

const FILTER_COLUMN_LABELS = FILTER_COLUMN_OPTIONS.reduce<Record<FilterColumnKey, string>>(
    (acc, option) => ({
        ...acc,
        [option.value]: option.label
    }),
    {} as Record<FilterColumnKey, string>
);

const getFilterValue = (value: unknown) =>
    value && typeof value === "object" && "value" in value
        ? (value as { value?: unknown }).value
        : value;

const normalizeFilterValue = (value: unknown) => {
    const text = String(getFilterValue(value) ?? "").trim();
    return text || undefined;
};

const normalizeStatusFilterValue = (value: unknown) => {
    const text = normalizeFilterValue(value);
    return text ? toWorkOrderStatusFilterValue(text) ?? text : undefined;
};

const normalizeFilters = (filters: ListQcWorkOrderFilters): ListQcWorkOrderFilters => ({
    lifecycleState: normalizeStatusFilterValue(filters.lifecycleState),
    roomId: normalizeFilterValue(filters.roomId),
    rackLocationId: normalizeFilterValue(filters.rackLocationId),
    createdBy: normalizeFilterValue(filters.createdBy),
});

const normalizeLastUpdatedFilterValue = (value: unknown) => {
    const text = normalizeFilterValue(value);
    if (!text) {
        return undefined;
    }

    const dateParts = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    return dateParts ? `${dateParts[1]}/${dateParts[2]}/${dateParts[3]}` : text;
};

const normalizeClientFilters = (
    filters: ListQcWorkOrderClientFilters
): ListQcWorkOrderClientFilters => ({
    id: normalizeFilterValue(filters.id),
    timeUpdated: normalizeLastUpdatedFilterValue(filters.timeUpdated),
    assignee: normalizeFilterValue(filters.assignee),
});

const getActiveFilterCount = (
    filters: ListQcWorkOrderFilters,
    clientFilters: ListQcWorkOrderClientFilters = {}
) =>
    [
        ...Object.values(normalizeFilters(filters)),
        ...Object.values(normalizeClientFilters(clientFilters))
    ].filter(Boolean).length;

const getStatusFilterLabel = (value: unknown) => {
    const normalizedValue = normalizeStatusFilterValue(value);
    return WORK_ORDER_STATUS_SELECT_OPTIONS.find((option) => option.value === normalizedValue)?.label
        ?? normalizeFilterValue(value)
        ?? "";
};

const getInitialFilterColumn = (
    filters: ListQcWorkOrderFilters,
    clientFilters: ListQcWorkOrderClientFilters = {}
): FilterColumnKey =>
    clientFilters.id ? "id"
        : filters.lifecycleState ? "lifecycleState"
            : clientFilters.timeUpdated ? "timeUpdated"
                : clientFilters.assignee ? "assignee"
                    : filters.roomId ? "roomId"
                        : filters.rackLocationId ? "rackLocationId"
                            : filters.createdBy ? "createdBy"
                                : "id";

const getFilterSummaryItems = (
    filters: ListQcWorkOrderFilters,
    clientFilters: ListQcWorkOrderClientFilters = {}
) => {
    const normalizedFilters = normalizeFilters(filters);
    const normalizedClientFilters = normalizeClientFilters(clientFilters);

    return FILTER_COLUMN_OPTIONS.map((option) => {
        const value = option.value === "id"
            ? normalizedClientFilters.id
            : option.value === "timeUpdated"
                ? normalizedClientFilters.timeUpdated
                : option.value === "assignee"
                    ? normalizedClientFilters.assignee
                    : option.value === "lifecycleState"
                        ? normalizedFilters.lifecycleState
                        : normalizedFilters[option.value];

        if (!value) {
            return undefined;
        }

        return {
            column: option.value,
            label: option.label,
            value: option.value === "lifecycleState" ? getStatusFilterLabel(value) : value
        };
    }).filter((item): item is { column: FilterColumnKey; label: string; value: string } => Boolean(item));
};

export const WorkOrderFilters = ({
    query,
    disabled,
    onQueryChange
}: WorkOrderFiltersProps) => {
    const [draftFilters, setDraftFilters] = useState<ListQcWorkOrderFilters>(
        query.filters
    );
    const [draftClientFilters, setDraftClientFilters] = useState<ListQcWorkOrderClientFilters>(
        query.clientFilters ?? {}
    );
    const [filterDialogOpen, setFilterDialogOpen] = useState(false);
    const [selectedFilterColumn, setSelectedFilterColumn] = useState<FilterColumnKey>(() =>
        getInitialFilterColumn(query.filters, query.clientFilters ?? {})
    );
    const statusFilterOptions = useMemo(
        () => new ArrayDataProvider(WORK_ORDER_STATUS_SELECT_OPTIONS, { keyAttributes: "value" }),
        []
    );
    const filterColumnOptions = useMemo(
        () => new ArrayDataProvider(FILTER_COLUMN_OPTIONS, { keyAttributes: "value" }),
        []
    );

    useEffect(() => {
        setDraftFilters(query.filters);
        setDraftClientFilters(query.clientFilters ?? {});
    }, [query.clientFilters, query.filters]);

    const updateDraftFilter = (
        field: keyof ListQcWorkOrderFilters,
        value: unknown
    ) => {
        setDraftFilters((current) => ({
            ...current,
            [field]: normalizeFilterValue(value)
        }));
    };

    const updateDraftClientFilter = (
        field: keyof ListQcWorkOrderClientFilters,
        value: unknown
    ) => {
        setDraftClientFilters((current) => ({
            ...current,
            [field]: field === "timeUpdated"
                ? normalizeLastUpdatedFilterValue(value)
                : normalizeFilterValue(value)
        }));
    };

    const getDraftFilterValue = (field: FilterColumnKey) => {
        switch (field) {
            case "id":
                return draftClientFilters.id ?? "";
            case "timeUpdated":
                return draftClientFilters.timeUpdated ?? "";
            case "assignee":
                return draftClientFilters.assignee ?? "";
            case "lifecycleState":
                return normalizeStatusFilterValue(draftFilters.lifecycleState) ?? "";
            case "roomId":
                return draftFilters.roomId ?? "";
            case "rackLocationId":
                return draftFilters.rackLocationId ?? "";
            case "createdBy":
                return draftFilters.createdBy ?? "";
            default:
                return "";
        }
    };

    const updateSelectedFilterValue = (value: unknown) => {
        if (selectedFilterColumn === "id"
            || selectedFilterColumn === "timeUpdated"
            || selectedFilterColumn === "assignee") {
            updateDraftClientFilter(selectedFilterColumn, value);
            return;
        }

        updateDraftFilter(selectedFilterColumn, value);
    };

    const removeDraftFilter = (field: FilterColumnKey) => {
        if (field === "id" || field === "timeUpdated" || field === "assignee") {
            setDraftClientFilters((current) => {
                const next = { ...current };
                delete next[field];
                return next;
            });
            return;
        }

        setDraftFilters((current) => {
            const next = { ...current };
            delete next[field];
            return next;
        });
    };

    const openFilterDialog = () => {
        setDraftFilters(query.filters);
        setDraftClientFilters(query.clientFilters ?? {});
        setSelectedFilterColumn(getInitialFilterColumn(query.filters, query.clientFilters ?? {}));
        setFilterDialogOpen(true);
    };

    const applyFilters = () => {
        onQueryChange({
            ...query,
            filters: normalizeFilters(draftFilters),
            clientFilters: normalizeClientFilters(draftClientFilters),
        });
        setFilterDialogOpen(false);
    };

    const clearFilters = () => {
        setDraftFilters({});
        setDraftClientFilters({});
    };

    const activeFilterCount = getActiveFilterCount(query.filters, query.clientFilters ?? {});
    const draftFilterCount = getActiveFilterCount(draftFilters, draftClientFilters);
    const applyFilterLabel = draftFilterCount ? `Apply (${draftFilterCount})` : "Apply";
    const draftFilterSummaryItems = getFilterSummaryItems(draftFilters, draftClientFilters);
    const activeFilterLabel = activeFilterCount === 1 ? "1 active filter" : `${activeFilterCount} active filters`;

    return (
        <div className="wo-filter-bar">
            <div className="wo-filter-button-row">
                <oj-c-button
                    chroming={activeFilterCount ? "solid" : "outlined"}
                    display="all"
                    label={activeFilterCount ? `Filters (${activeFilterCount})` : "Filters"}
                    disabled={disabled}
                    onojAction={openFilterDialog}
                >
                    <span slot="startIcon" className="oj-ux-ico-filter" />
                </oj-c-button>
                {activeFilterCount > 0 && (
                    <span className="wo-filter-active-summary">{activeFilterLabel}</span>
                )}
            </div>
            <oj-c-dialog
                id="woFilterDialog"
                opened={filterDialogOpen}
                onopenedChanged={(event: any) => {
                    if (!event.detail.value) {
                        setFilterDialogOpen(false);
                    }
                }}
            >
                <div slot="body" className="wo-filter-dialog">
                    <div className="wo-filter-dialog-header">
                        <h3>Filter Work Orders</h3>
                    </div>

                    <div className="wo-filter-dialog-form">
                        <oj-c-select-single
                            class="wo-filter-select"
                            data={filterColumnOptions}
                            itemText="label"
                            labelHint="Column"
                            value={selectedFilterColumn}
                            onvalueChanged={(event: any) =>
                                setSelectedFilterColumn(event.detail.value || "id")
                            }
                        />

                        {selectedFilterColumn === "lifecycleState" ? (
                            <oj-c-select-single
                                class="wo-filter-select"
                                data={statusFilterOptions}
                                itemText="label"
                                labelHint="Value"
                                value={getDraftFilterValue(selectedFilterColumn)}
                                onvalueChanged={(event: any) =>
                                    updateSelectedFilterValue(event.detail.value)
                                }
                            />
                        ) : (
                            <oj-c-input-text
                                class="wo-filter-input"
                                label-hint={FILTER_COLUMN_LABELS[selectedFilterColumn]}
                                label-edge="inside"
                                placeholder={selectedFilterColumn === "timeUpdated" ? "YYYY/MM/DD" : undefined}
                                value={getDraftFilterValue(selectedFilterColumn)}
                                onvalueChanged={(event: any) =>
                                    updateSelectedFilterValue(event.detail.value)
                                }
                                clear-icon="always"
                            ></oj-c-input-text>
                        )}
                    </div>

                    <div className="wo-filter-chip-list" aria-label="Selected filters">
                        {draftFilterSummaryItems.length === 0 ? (
                            <div className="wo-filter-empty">No filters selected</div>
                        ) : (
                            draftFilterSummaryItems.map((item) => (
                                <span className="wo-filter-chip" key={item.column}>
                                    <span>{item.label}: {item.value}</span>
                                    <button
                                        type="button"
                                        className="wo-filter-chip-remove"
                                        aria-label={`Remove ${item.label} filter`}
                                        onClick={() => removeDraftFilter(item.column)}
                                    >
                                        x
                                    </button>
                                </span>
                            ))
                        )}
                    </div>

                    <div className="wo-filter-dialog-actions">
                        <oj-c-button
                            chroming="outlined"
                            display="all"
                            label="Cancel"
                            onojAction={() => setFilterDialogOpen(false)}
                        />
                        <oj-c-button
                            chroming="outlined"
                            display="all"
                            label="Clear All"
                            disabled={draftFilterCount === 0}
                            onojAction={clearFilters}
                        />
                        <oj-c-button
                            chroming="callToAction"
                            display="all"
                            label={applyFilterLabel}
                            disabled={disabled}
                            onojAction={applyFilters}
                        />
                    </div>
                </div>
            </oj-c-dialog>
        </div>
    );
};
