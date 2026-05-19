export type WorkOrderStatusFilterValue = "IN_PROGRESS" | "FAILED" | "SUCCEEDED";

type WorkOrderStatusFilterOption = {
    label: string;
    value: WorkOrderStatusFilterValue;
};

export const WORK_ORDER_STATUS_FILTER_OPTIONS: WorkOrderStatusFilterOption[] = [
    { label: "In Progress", value: "IN_PROGRESS" },
    { label: "Failed", value: "FAILED" },
    { label: "Succeeded", value: "SUCCEEDED" }
];

export const WORK_ORDER_STATUS_SELECT_OPTIONS = [
    { label: "All statuses", value: "" },
    ...WORK_ORDER_STATUS_FILTER_OPTIONS
];

const STATUS_FILTER_VALUE_BY_BACKEND_STATUS: Record<string, WorkOrderStatusFilterValue> = {
    INPROGRESS: "IN_PROGRESS",
    FAILED: "FAILED",
    SUCCEEDED: "SUCCEEDED"
};

const STATUS_LABEL_BY_BACKEND_STATUS: Record<string, string> = {
    INPROGRESS: "In Progress",
    FAILED: "Failed",
    SUCCEEDED: "Succeeded"
};

const STATUS_LABEL_BY_FILTER_VALUE: Record<WorkOrderStatusFilterValue, string> =
    WORK_ORDER_STATUS_FILTER_OPTIONS.reduce(
        (labels, option) => ({
            ...labels,
            [option.value]: option.label
        }),
        {} as Record<WorkOrderStatusFilterValue, string>
    );

const normalizeStatusKey = (value: unknown) =>
    String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

const formatUnknownStatus = (value: unknown) =>
    String(value ?? "")
        .trim()
        .toLowerCase()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

export const toWorkOrderStatusFilterValue = (
    value: unknown
): WorkOrderStatusFilterValue | undefined =>
    STATUS_FILTER_VALUE_BY_BACKEND_STATUS[normalizeStatusKey(value)];

export const getWorkOrderStatusLabel = (value: unknown) => {
    const statusKey = normalizeStatusKey(value);
    const filterValue = STATUS_FILTER_VALUE_BY_BACKEND_STATUS[statusKey];

    return STATUS_LABEL_BY_BACKEND_STATUS[statusKey]
        || (filterValue ? STATUS_LABEL_BY_FILTER_VALUE[filterValue] : undefined)
        || formatUnknownStatus(value)
        || "Unavailable";
};
