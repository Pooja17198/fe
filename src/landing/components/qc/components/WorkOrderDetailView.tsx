import { h, FunctionalComponent } from "preact";
import { useEffect, useState } from "preact/hooks";
import "oj-c/button";
import "oj-c/progress-circle";
import "ojs/ojdrawerpopup";

import {
    getQcTaskAssignedTo,
    listQcTaskAttachments,
    listQcTaskComments,
    useGetQcWorkOrder,
    useListQcWorkOrderTasks
} from "../api/hooks/qcApi";
import {
    TASK_SECTIONS,
    getTaskSectionKey,
    getTaskTitle
} from "./taskSections";
import type {
    QcTaskAttachmentSummary,
    QcTaskCommentSummary,
    QcTaskSummary,
    QcWorkOrder
} from "../../../../../gen/clients/ide-lvv-client";

type WorkOrderDetailViewProps = {
    workOrderId: string;
    onBack: () => void;
    onBeginWorkflow: () => void;
};

type DetailRow = {
    label: string;
    value: string;
};

type ItemEntry = {
    id: string;
    item: string;
    note?: string;
    status: string;
    isComplete: boolean;
};

type ItemSection = {
    title: string;
    entries: ItemEntry[];
};

type DetailAttachment = {
    id: string;
    name?: string;
    src?: string;
    contentType?: string;
    contentSize?: number;
    createdBy?: string;
};

type DetailCommentState = {
    items: QcTaskCommentSummary[];
    error?: string;
    isLoading: boolean;
    hasLoaded: boolean;
};

const DEFAULT_PORTAL_VENDOR_NAME = "LVV Portal Vendor";
const PHOTO_LOAD_INLINE_ERROR = "Photos unavailable.";

const formatValue = (value: string | null | undefined, fallback = "Unavailable") =>
    value && value.trim() ? value : fallback;

const formatTimestamp = (value?: string) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
        return "Unavailable";
    }

    return new Intl.DateTimeFormat("en-US", {
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).format(date);
};

const formatStatus = (value?: string) =>
    (value || "Unavailable")
        .toLowerCase()
        .split(/[\s_-]+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

const isCompletedStatus = (value?: string) =>
    ["COMPLETE", "COMPLETED"].includes((value || "").toUpperCase());

const getTaskStatusIconClass = (isComplete: boolean) =>
    [
        "wo-workflow-status",
        isComplete ? "wo-workflow-status-pass" : "wo-workflow-status-fail"
    ].join(" ");

const createDefaultDetailCommentState = (): DetailCommentState => ({
    items: [],
    isLoading: false,
    hasLoaded: false
});

const getDetailCommentState = (
    commentsByTaskId: Record<string, DetailCommentState>,
    taskId: string
) => commentsByTaskId[taskId] ?? createDefaultDetailCommentState();

const sortCommentsByNewest = (comments: QcTaskCommentSummary[]) =>
    [...comments].sort((a, b) => {
        const aTime = new Date(a.timeCreated).getTime();
        const bTime = new Date(b.timeCreated).getTime();

        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });

const sortAttachmentsByNewest = (attachments: QcTaskAttachmentSummary[]) =>
    [...attachments].sort((a, b) => {
        const aTime = new Date(a.timeCreated).getTime();
        const bTime = new Date(b.timeCreated).getTime();

        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });

const toAttachmentImageSrc = (contentType?: string, content?: string) => {
    if (!contentType?.startsWith("image/") || !content) {
        return undefined;
    }

    return `data:${contentType};base64,${content}`;
};

const createDetailAttachmentFromSummary = (
    attachment: QcTaskAttachmentSummary
): DetailAttachment => {
    const content = (attachment as QcTaskAttachmentSummary & { content?: string }).content;

    return {
        id: attachment.attachmentId,
        name: attachment.fileName,
        src: toAttachmentImageSrc(attachment.contentType, content),
        contentType: attachment.contentType,
        contentSize: attachment.contentSize,
        createdBy: attachment.createdBy
    };
};

const formatCommentTimestamp = (value?: string) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
        return "Unavailable";
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
};

const getWorkOrderActionLabel = (tasks: QcTaskSummary[]) => {
    const assignedTasks = tasks.filter((task) => getQcTaskAssignedTo(task));
    const completedCount = assignedTasks.filter((task) => isCompletedStatus(task.lifecycleState)).length;

    if (assignedTasks.length === 0 || completedCount === assignedTasks.length) {
        return null;
    }

    return completedCount > 0 ? "Resume" : "Begin WO";
};

const getWorkOrderHeading = (workOrder: QcWorkOrder) =>
    workOrder.displayName || workOrder.id;

const copyTextToClipboard = async (value: string) => {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }

    const textArea = document.createElement("textarea");
    textArea.value = value;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
};

const buildDetailRows = (workOrder: QcWorkOrder, tasks: QcTaskSummary[]): DetailRow[] => {
    const taskAssignee = getQcTaskAssignedTo(tasks[0]);

    return [
        { label: "WO Type", value: "QC" },
        { label: "Status", value: formatStatus(workOrder.lifecycleState) },
        { label: "Room Name", value: formatValue(workOrder.roomId) },
        { label: "Created On", value: formatTimestamp(workOrder.timeCreated) },
        { label: "Created By", value: formatValue(workOrder.createdBy) },
        { label: "Last Updated", value: formatTimestamp(workOrder.timeUpdated) },
        { label: "Region", value: formatValue(workOrder.regionId) },
        { label: "Building", value: formatValue(workOrder.buildingId) },
        { label: "Rack", value: formatValue(workOrder.rackLocationId) },
        { label: "Assignee", value: formatValue(taskAssignee || workOrder.vendorName) }
    ];
};

const buildTaskNote = (task: QcTaskSummary) => {
    const assignedTo = getQcTaskAssignedTo(task);
    const values = [
        assignedTo ? `Assigned to ${assignedTo}` : "Unassigned",
        task.timeUpdated ? `Updated ${formatTimestamp(task.timeUpdated)}` : undefined
    ].filter(Boolean);

    return values.join(" • ");
};

const buildItemSections = (tasks: QcTaskSummary[]): ItemSection[] => {
    const groupedEntries = tasks
        .reduce<Record<string, ItemEntry[]>>((acc, task) => {
            const sectionKey = getTaskSectionKey(task);
            const entries = acc[sectionKey] ?? [];
            entries.push({
                id: task.id,
                item: getTaskTitle(task).replace(/[_-]+/g, " "),
                note: buildTaskNote(task),
                status: formatStatus(task.lifecycleState),
                isComplete: isCompletedStatus(task.lifecycleState)
            });
            acc[sectionKey] = entries;
            return acc;
        }, {});

    return TASK_SECTIONS.map((section) => ({
        title: section.title,
        entries: groupedEntries[section.key] ?? []
    }));
};

const ReadOnlyAttachmentList: FunctionalComponent<{
    attachments: DetailAttachment[];
    isLoading?: boolean;
    error?: string;
    onImageLoadError: () => void;
    onPreviewAttachment: (attachment: DetailAttachment) => void;
}> = ({
    attachments,
    isLoading,
    error,
    onImageLoadError,
    onPreviewAttachment
}) => (
    <div className="wo-workflow-attachments wo-detail-attachments">
        {isLoading && (
            <span className="wo-workflow-attachment-status">Loading...</span>
        )}
        {!isLoading && attachments.length === 0 && !error && (
            <span className="wo-detail-task-empty-value">No photos</span>
        )}
        {attachments.map((attachment) =>
            attachment.src ? (
                <span
                    className="wo-workflow-photo-thumb"
                    key={attachment.id}
                    aria-label="Attached photo"
                >
                    <button
                        type="button"
                        className="wo-workflow-photo-preview-button"
                        aria-label={`Preview ${attachment.name || "attached photo"}`}
                        onClick={() => onPreviewAttachment(attachment)}
                    >
                        <img
                            src={attachment.src}
                            alt={attachment.name || "Attached photo"}
                            onError={(event) => {
                                (event.currentTarget as HTMLImageElement).style.display = "none";
                                onImageLoadError();
                            }}
                        />
                    </button>
                </span>
            ) : (
                <span className="wo-workflow-photo-name" key={attachment.id}>
                    <span className="wo-workflow-file-label">
                        {attachment.name || "Attached photo"}
                    </span>
                </span>
            )
        )}
        {error && (
            <span className="wo-workflow-attachment-error" role="alert">
                {error}
            </span>
        )}
    </div>
);

const ReadOnlyCommentsPanel: FunctionalComponent<{
    itemTitle: string;
    state: DetailCommentState;
}> = ({
    itemTitle,
    state
}) => (
    <div className="wo-workflow-comments-panel" aria-label={`Comments for ${itemTitle}`}>
        {state.isLoading ? (
            <div className="wo-workflow-comments-status">Loading comments...</div>
        ) : (
            <>
                {state.error && (
                    <div className="wo-workflow-comments-error" role="alert">
                        {state.error}
                    </div>
                )}

                <div className="wo-workflow-comments-list">
                    {state.items.length === 0 ? (
                        <div className="wo-workflow-comments-empty">No comments</div>
                    ) : (
                        state.items.map((comment) => (
                            <article className="wo-workflow-comment" key={comment.commentId}>
                                <div className="wo-workflow-comment-meta">
                                    <span>{formatValue(comment.createdBy, DEFAULT_PORTAL_VENDOR_NAME)}</span>
                                    <span>{formatCommentTimestamp(comment.timeCreated)}</span>
                                </div>
                                <div className="wo-workflow-comment-text">{comment.comment}</div>
                            </article>
                        ))
                    )}
                </div>
            </>
        )}
    </div>
);

export const WorkOrderDetailView: FunctionalComponent<WorkOrderDetailViewProps> = ({
    workOrderId,
    onBack,
    onBeginWorkflow
}) => {
    const [attachmentsByTaskId, setAttachmentsByTaskId] = useState<Record<string, DetailAttachment[]>>({});
    const [attachmentLoadingByTaskId, setAttachmentLoadingByTaskId] = useState<Record<string, boolean>>({});
    const [attachmentLoadErrors, setAttachmentLoadErrors] = useState<Record<string, string | undefined>>({});
    const [commentsByTaskId, setCommentsByTaskId] = useState<Record<string, DetailCommentState>>({});
    const [activeCommentTaskId, setActiveCommentTaskId] = useState<string | null>(null);
    const [activeImagePreview, setActiveImagePreview] = useState<DetailAttachment | null>(null);
    const {
        data: workOrder,
        isFetching: workOrderFetching,
        error: workOrderError
    } = useGetQcWorkOrder(workOrderId);
    const {
        data: taskCollection,
        isFetching: tasksFetching,
        error: tasksError
    } = useListQcWorkOrderTasks(workOrderId);

    const tasks = taskCollection?.items ?? [];
    const taskIds = tasks.map((task) => task.id);
    const taskIdsKey = taskIds.join("|");
    const detailRows = workOrder ? buildDetailRows(workOrder, tasks) : [];
    const itemSections = buildItemSections(tasks);
    const itemEntries = itemSections.flatMap((section) => section.entries);
    const activeCommentEntry = itemEntries.find((entry) => entry.id === activeCommentTaskId);
    const activeCommentState = activeCommentTaskId
        ? getDetailCommentState(commentsByTaskId, activeCommentTaskId)
        : null;
    const workOrderActionLabel = getWorkOrderActionLabel(tasks);
    const isFetching = workOrderFetching || tasksFetching;
    const hasError = workOrderError || tasksError;
    const handleCopyWorkOrderId = () => {
        void copyTextToClipboard(workOrderId).catch((error) => {
            console.error("Failed to copy work order id", error);
        });
    };
    const handleAttachmentImageLoadError = (taskId: string) => {
        setAttachmentLoadErrors((current) => ({
            ...current,
            [taskId]: PHOTO_LOAD_INLINE_ERROR
        }));
    };

    useEffect(() => {
        setAttachmentsByTaskId({});
        setAttachmentLoadingByTaskId({});
        setAttachmentLoadErrors({});
        setCommentsByTaskId({});
        setActiveCommentTaskId(null);
        setActiveImagePreview(null);
    }, [workOrderId]);

    useEffect(() => {
        if (taskIds.length === 0) {
            return;
        }

        let isActive = true;
        const loadingState = taskIds.reduce<Record<string, boolean>>((acc, taskId) => {
            acc[taskId] = true;
            return acc;
        }, {});

        setAttachmentLoadingByTaskId(loadingState);
        setAttachmentLoadErrors({});

        taskIds.forEach((taskId) => {
            void listQcTaskAttachments(taskId)
                .then((attachments) => {
                    if (!isActive) {
                        return;
                    }

                    setAttachmentsByTaskId((current) => ({
                        ...current,
                        [taskId]: sortAttachmentsByNewest(attachments.items ?? [])
                            .map(createDetailAttachmentFromSummary)
                    }));
                    setAttachmentLoadingByTaskId((current) => ({
                        ...current,
                        [taskId]: false
                    }));
                })
                .catch(() => {
                    if (!isActive) {
                        return;
                    }

                    setAttachmentLoadErrors((current) => ({
                        ...current,
                        [taskId]: PHOTO_LOAD_INLINE_ERROR
                    }));
                    setAttachmentLoadingByTaskId((current) => ({
                        ...current,
                        [taskId]: false
                    }));
                });
        });

        return () => {
            isActive = false;
        };
    }, [taskIdsKey]);

    useEffect(() => {
        if (taskIds.length === 0) {
            return;
        }

        let isActive = true;
        const loadingState = taskIds.reduce<Record<string, DetailCommentState>>((acc, taskId) => {
            acc[taskId] = {
                ...createDefaultDetailCommentState(),
                isLoading: true
            };
            return acc;
        }, {});

        setCommentsByTaskId(loadingState);

        taskIds.forEach((taskId) => {
            void listQcTaskComments(taskId)
                .then((comments) => {
                    if (!isActive) {
                        return;
                    }

                    setCommentsByTaskId((current) => ({
                        ...current,
                        [taskId]: {
                            items: sortCommentsByNewest(comments.items ?? []),
                            isLoading: false,
                            hasLoaded: true
                        }
                    }));
                })
                .catch(() => {
                    if (!isActive) {
                        return;
                    }

                    setCommentsByTaskId((current) => ({
                        ...current,
                        [taskId]: {
                            items: [],
                            isLoading: false,
                            hasLoaded: false,
                            error: "Unable to load comments."
                        }
                    }));
                });
        });

        return () => {
            isActive = false;
        };
    }, [taskIdsKey]);

    return (
        <div className="oj-web-applayout-max-width oj-web-applayout-content wo-detail-page">
            <div className="wo-detail-breadcrumb">
                <button type="button" className="wo-detail-breadcrumb-link" onClick={onBack}>
                    Work Orders
                </button>
                <span className="wo-detail-breadcrumb-separator">›</span>
                <span className="wo-detail-breadcrumb-current">{workOrderId}</span>
                <button
                    type="button"
                    className="wo-detail-copy-button"
                    aria-label={`Copy WO ID ${workOrderId}`}
                    title="Copy WO ID"
                    onClick={handleCopyWorkOrderId}
                >
                    <span className="oj-ux-ico-copy" aria-hidden="true" />
                </button>
            </div>

            {isFetching ? (
                <div className="wo-detail-empty">
                    <oj-c-progress-circle size="md" value={-1}></oj-c-progress-circle>
                    <div style={{ marginTop: "12px" }}>Loading work order details...</div>
                </div>
            ) : hasError || !workOrder ? (
                <div className="wo-detail-empty">
                    Unable to load work order details for <strong>{workOrderId}</strong>.
                </div>
            ) : (
                <>
                    <div className="wo-detail-page-header">
                        <h1 className="wo-detail-page-title">{getWorkOrderHeading(workOrder)}</h1>
                    </div>

                    <div className="wo-divider wo-detail-divider" />

                    <div className="wo-detail-section-header">
                        <h2>Work Order Details</h2>
                        {workOrderActionLabel && (
                            <div className="wo-detail-actions">
                                <oj-c-button
                                    chroming="callToAction"
                                    display="all"
                                    label={workOrderActionLabel}
                                    onojAction={onBeginWorkflow}
                                />
                            </div>
                        )}
                    </div>

                    <div className="wo-detail-rows">
                        {detailRows.map((row) => (
                            <div className="wo-detail-row" key={row.label}>
                                <div className="wo-detail-row-label">{row.label}</div>
                                <div className={`wo-detail-row-value${row.label === "Comment" ? " wo-detail-row-comment" : ""}`}>
                                    {row.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="wo-items-header">
                        <h2>Items to Be Addressed ({tasks.length})</h2>
                    </div>

                    {itemSections.map((section) => (
                        <section className="wo-items-section" key={section.title}>
                            <h3>{section.title}</h3>

                            {section.entries.length === 0 ? (
                                <div className="wo-items-empty">No items</div>
                            ) : (
                                <div className="wo-items-table">
                                    <div className="wo-items-table-header">
                                        <div>Item</div>
                                        <div>Status</div>
                                        <div>Photos</div>
                                        <div>Comments</div>
                                    </div>

                                    {section.entries.map((entry) => {
                                        const commentState = getDetailCommentState(commentsByTaskId, entry.id);
                                        const commentButtonLabel = commentState.isLoading
                                            ? "Loading..."
                                            : `Comments (${commentState.items.length})`;

                                        return (
                                            <div className="wo-items-row" key={entry.id}>
                                                <div className="wo-items-item-cell">
                                                    <span
                                                        className={getTaskStatusIconClass(entry.isComplete)}
                                                        aria-hidden="true"
                                                    />
                                                    <div>
                                                        <div className="wo-items-item-title">{entry.item}</div>
                                                        {entry.note && <div className="wo-items-item-note">{entry.note}</div>}
                                                    </div>
                                                </div>

                                                <div className="wo-items-status-cell">
                                                    <span className="wo-task-status">{entry.status}</span>
                                                </div>

                                                <div className="wo-items-photos-cell">
                                                    <ReadOnlyAttachmentList
                                                        attachments={attachmentsByTaskId[entry.id] ?? []}
                                                        isLoading={attachmentLoadingByTaskId[entry.id]}
                                                        error={attachmentLoadErrors[entry.id]}
                                                        onImageLoadError={() => handleAttachmentImageLoadError(entry.id)}
                                                        onPreviewAttachment={setActiveImagePreview}
                                                    />
                                                </div>

                                                <div className="wo-items-comments-cell">
                                                    <button
                                                        type="button"
                                                        className="wo-workflow-comments-toggle"
                                                        disabled={commentState.isLoading}
                                                        onClick={() => setActiveCommentTaskId(entry.id)}
                                                    >
                                                        {commentButtonLabel}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    ))}

                    <oj-drawer-popup
                        edge="end"
                        modality="modal"
                        auto-dismiss="none"
                        opened={Boolean(activeCommentEntry)}
                        onopenedChanged={(event: any) => {
                            if (!event.detail.value) {
                                setActiveCommentTaskId(null);
                            }
                        }}
                        class="wo-comments-drawer"
                    >
                        <div className="wo-comments-drawer-shell">
                            <div className="wo-comments-drawer-header">
                                <div>
                                    <h3>Comments</h3>
                                    <div className="wo-comments-drawer-subtitle">
                                        {activeCommentEntry?.item ?? ""}
                                    </div>
                                </div>
                                <oj-c-button
                                    chroming="borderless"
                                    display="icons"
                                    label="Close"
                                    onojAction={() => setActiveCommentTaskId(null)}
                                >
                                    <span slot="startIcon" className="oj-ux-ico-close" />
                                </oj-c-button>
                            </div>
                            <div className="wo-comments-drawer-body">
                                {activeCommentEntry && activeCommentState && (
                                    <ReadOnlyCommentsPanel
                                        itemTitle={activeCommentEntry.item}
                                        state={activeCommentState}
                                    />
                                )}
                            </div>
                        </div>
                    </oj-drawer-popup>

                    {activeImagePreview?.src && (
                        <div
                            className="wo-image-preview-overlay"
                            role="dialog"
                            aria-modal="true"
                            aria-label={activeImagePreview.name || "Attached photo preview"}
                            onClick={() => setActiveImagePreview(null)}
                        >
                            <div
                                className="wo-image-preview-panel"
                                onClick={(event) => event.stopPropagation()}
                            >
                                <div className="wo-image-preview-header">
                                    <div className="wo-image-preview-title">
                                        {activeImagePreview.name || "Attached photo"}
                                    </div>
                                    <button
                                        type="button"
                                        className="wo-image-preview-close"
                                        aria-label="Close image preview"
                                        onClick={() => setActiveImagePreview(null)}
                                    >
                                        <span className="oj-ux-ico-close" aria-hidden="true" />
                                    </button>
                                </div>
                                <div className="wo-image-preview-body">
                                    <img
                                        src={activeImagePreview.src}
                                        alt={activeImagePreview.name || "Attached photo"}
                                    />
                                </div>
                                <div className="wo-image-preview-actions">
                                    <div className="wo-image-preview-meta">
                                        <span>Uploaded by</span>
                                        <strong>{formatValue(activeImagePreview.createdBy, DEFAULT_PORTAL_VENDOR_NAME)}</strong>
                                    </div>
                                    <a
                                        className="wo-image-preview-download"
                                        href={activeImagePreview.src}
                                        download={activeImagePreview.name || "qc-task-photo"}
                                    >
                                        <span className="oj-ux-ico-download" aria-hidden="true" />
                                        Download
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
