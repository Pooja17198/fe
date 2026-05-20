import { h, FunctionalComponent } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import "oj-c/button";
import "oj-c/progress-circle";
import "ojs/ojdrawerpopup";

import {
    createQcTaskAttachment,
    createQcTaskComment,
    evaluateQcTask,
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
    CreateQcTaskAttachmentDetails,
    CreateQcTaskCommentDetails,
    EvaluateQcTaskDetails,
    QcTaskEvaluationResult,
    QcTaskAttachmentSummary,
    QcTaskCommentSummary,
    QcTaskSummary,
    QcWorkOrder
} from "../../../../../gen/clients/ide-lvv-client";

type WorkOrderWorkflowViewProps = {
    workOrderId: string;
    vendorName?: string;
    onBackToList: () => void;
    onBackToDetail: (options?: { replaceHistory?: boolean }) => void;
};

type WorkflowAttachment = {
    id: string;
    name?: string;
    thumbnail?: boolean;
    isPersisted?: boolean;
    src?: string;
    contentType?: string;
    contentSize?: number;
    createdBy?: string;
    content?: string;
};

type WorkflowItem = {
    id: string;
    title: string;
    detail?: string;
    sectionKey: string;
    isComplete: boolean;
    vendorName?: string;
    attachments: WorkflowAttachment[];
};

type WorkflowSection = {
    key: string;
    title: string;
    entries: WorkflowItem[];
};

type EvaluationDraft = EvaluateQcTaskDetails;
type WorkflowSubmitAction = "saveAndClose";

type CreateQcTaskAttachmentPayload = CreateQcTaskAttachmentDetails & {
    emailAddress: string;
    notes: string;
};

type CreateQcTaskCommentPayload = CreateQcTaskCommentDetails & {
    emailAddress: string;
};

type TaskCommentState = {
    items: QcTaskCommentSummary[];
    draft: string;
    error?: string;
    isOpen: boolean;
    isLoading: boolean;
    isSubmitting: boolean;
    hasLoaded: boolean;
};

type WorkflowOperation = {
    label: string;
    run: () => Promise<unknown>;
};

class WorkflowSubmitError extends Error {
    public originalError: unknown;

    constructor(label: string, originalError: unknown) {
        super(label);
        this.name = "WorkflowSubmitError";
        this.originalError = originalError;
    }
}

const DEFAULT_PORTAL_VENDOR_NAME = "LVV Portal Vendor";
const PHOTO_LOAD_INLINE_ERROR = "Photos unavailable. Try again.";
const IMAGE_ATTACHMENTS_ONLY_ERROR = "Only image files can be attached.";
const MAX_ATTACHMENT_IMAGE_DIMENSION = 1024;
const IMAGE_ATTACHMENT_COMPRESSION_MIN_BYTES = 256 * 1024;
const MAX_ATTACHMENT_UPLOAD_BYTES = 512 * 1024;
const IMAGE_ATTACHMENT_COMPRESSION_CANDIDATES = [
    { dimension: 1024, quality: 0.72 },
    { dimension: 1024, quality: 0.56 },
    { dimension: 800, quality: 0.56 },
    { dimension: 800, quality: 0.42 },
    { dimension: 640, quality: 0.42 }
];
const RESPONSE_ERROR_BODY_TIMEOUT_MS = 3000;

const PDF_FALLBACK_TASKS: QcTaskSummary[] = [
    {
        id: "fallback-general-rack-label",
        workOrderId: "fallback",
        taskKey: "general:Rack label applied",
        lifecycleState: "COMPLETED"
    },
    {
        id: "fallback-general-leveling-feet",
        workOrderId: "fallback",
        taskKey: "general:Leveling feet down & Rack level",
        lifecycleState: "COMPLETED"
    },
    {
        id: "fallback-general-waterfall",
        workOrderId: "fallback",
        taskKey: "general:Waterfall installed",
        lifecycleState: "FAILED"
    },
    {
        id: "fallback-cabling-routing",
        workOrderId: "fallback",
        taskKey: "cabling:Cable routing appropriate",
        lifecycleState: "FAILED"
    },
    {
        id: "fallback-patch-panel-dressed",
        workOrderId: "fallback",
        taskKey: "patch-panel:Cabling dressed front and rear",
        lifecycleState: "FAILED"
    }
];

const formatValue = (value: string | null | undefined, fallback = "Unavailable") =>
    value && value.trim() ? value : fallback;

const getPortalVendorName = (vendorName?: string) =>
    vendorName?.trim() || DEFAULT_PORTAL_VENDOR_NAME;

const isCompletedStatus = (value?: string) =>
    ["COMPLETE", "COMPLETED", "SUCCEEDED"].includes((value || "").toUpperCase());

const toWorkOrderLabel = (workOrderId: string) => {
    if (!workOrderId) {
        return "Unavailable";
    }

    return workOrderId.replace(/^WO-/i, "");
};

const getTaskDetail = (title: string) =>
    title.toLowerCase().includes("cable routing")
        ? "-no crosses, correct cable management finger, etc."
        : undefined;

const buildWorkflowSections = (tasks: QcTaskSummary[]): WorkflowSection[] => {
    const sourceTasks = tasks.length > 0 ? tasks : PDF_FALLBACK_TASKS;

    const groupedEntries = sourceTasks.reduce<Record<string, WorkflowItem[]>>((acc, task) => {
        const title = getTaskTitle(task).replace(/[_-]+/g, " ");
        const sectionKey = getTaskSectionKey(task);
        const entries = acc[sectionKey] ?? [];

        entries.push({
            id: task.id,
            title,
            sectionKey,
            detail: getTaskDetail(title),
            isComplete: isCompletedStatus(task.lifecycleState),
            vendorName: task.vendorName,
            attachments: []
        });

        acc[sectionKey] = entries;
        return acc;
    }, {});

    return TASK_SECTIONS.map((section) => ({
        ...section,
        entries: groupedEntries[section.key] ?? []
    }));
};

const getRacksLabel = (workOrder?: QcWorkOrder) => {
    const rackList = (workOrder as any)?.rackLocationIds;

    if (Array.isArray(rackList) && rackList.length > 0) {
        return rackList.join(", ");
    }

    return formatValue(workOrder?.rackLocationId, "Unavailable");
};

const getVendorLabel = (workOrder: QcWorkOrder | undefined, tasks: QcTaskSummary[] = []) => {
    const taskAssignee = tasks.find((task) => task.vendorName?.trim())?.vendorName;

    return formatValue(
        taskAssignee || (workOrder as any)?.vendorName || (workOrder as any)?.vendor || workOrder?.vendorName,
        "Unavailable"
    );
};

const createDefaultTaskCommentState = (): TaskCommentState => ({
    items: [],
    draft: "",
    isOpen: false,
    isLoading: false,
    isSubmitting: false,
    hasLoaded: false
});

const getTaskCommentState = (
    commentsByTaskId: Record<string, TaskCommentState>,
    taskId: string
) => commentsByTaskId[taskId] ?? createDefaultTaskCommentState();

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

const createWorkflowAttachmentFromSummary = (
    attachment: QcTaskAttachmentSummary
): WorkflowAttachment => {
    const content = (attachment as QcTaskAttachmentSummary & { content?: string }).content;
    const src = toAttachmentImageSrc(attachment.contentType, content);

    return {
        id: attachment.attachmentId,
        name: attachment.fileName,
        thumbnail: Boolean(src),
        isPersisted: true,
        src,
        contentType: attachment.contentType,
        contentSize: attachment.contentSize,
        createdBy: attachment.createdBy
    };
};

const isImageFile = (file: File) => file.type.startsWith("image/");

const toJpegFileName = (fileName: string) => {
    const trimmedName = fileName.trim();

    if (!trimmedName) {
        return "attachment.jpg";
    }

    return /\.[^.]+$/.test(trimmedName)
        ? trimmedName.replace(/\.[^.]+$/, ".jpg")
        : `${trimmedName}.jpg`;
};

const formatFileSize = (bytes: number) =>
    bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.ceil(bytes / 1024)} KB`;

const getAttachmentSizeError = (fileName: string, size: number) =>
    `${fileName || "Image"} is ${formatFileSize(size)} after compression. `
    + `Please attach an image under ${formatFileSize(MAX_ATTACHMENT_UPLOAD_BYTES)}.`;

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

const createEvaluationDraft = (
    evaluatedBy: string,
    isPass: boolean,
    timeEvaluated = new Date().toISOString()
): EvaluationDraft => {
    // TODO: handle fail
    //  const result: QcTaskEvaluationResult = isPass ? "PASS" : "FAIL";
    const result: QcTaskEvaluationResult =  "PASS";

    return {
        result,
        evaluatedBy,
        timeEvaluated
    };
};

const createCommentDetails = (
    createdBy: string,
    comment: string,
    timeCreated = new Date().toISOString()
): CreateQcTaskCommentPayload => ({
    comment,
    createdBy,
    emailAddress: createdBy,
    timeCreated
});

const createAttachmentDetails = (
    createdBy: string,
    entry: WorkflowItem,
    attachment: WorkflowAttachment,
    timeCreated: string
): CreateQcTaskAttachmentPayload | null => {
    if (
        !attachment.name
        || !attachment.contentType?.startsWith("image/")
        || !attachment.content
    ) {
        return null;
    }

    if ((attachment.contentSize ?? 0) > MAX_ATTACHMENT_UPLOAD_BYTES) {
        throw new Error(getAttachmentSizeError(attachment.name, attachment.contentSize ?? 0));
    }

    return {
        fileName: attachment.name,
        contentType: attachment.contentType,
        contentSize: attachment.contentSize as number,
        createdBy,
        emailAddress: createdBy,
        notes: entry.title,
        timeCreated,
        content: attachment.content
    };
};

const getFriendlyResponseErrorMessage = (response: Response) => {
    if (response.status === 401 || response.status === 403) {
        return "You do not have permission to complete this request.";
    }

    if (response.status === 404) {
        return "The work order or task could not be found. Refresh the page and try again.";
    }

    if (response.status === 408 || response.status === 504) {
        return "The request took too long. Please try again.";
    }

    if (response.status === 413) {
        return "One of the selected images is too large to upload.";
    }

    if (response.status === 429) {
        return "The service is busy. Please wait a moment and try again.";
    }

    if (response.status >= 500) {
        return "The service had a problem saving your changes. Please try again.";
    }

    return "Unable to complete the request. Please try again.";
};

const hasDebugDetails = (message: string) =>
    /\b(endpoint|requestId|opc-request-id|taskId|jsonPayload|contentSize):/i.test(message);

const getResponseErrorMessage = async (response: Response) => {
    const requestId = response.headers.get("opc-request-id");
    let responseBody: unknown;
    let timeoutId: number | undefined;

    try {
        const bodyText = await Promise.race([
            response.clone().text(),
            new Promise<undefined>((resolve) => {
                timeoutId = window.setTimeout(
                    () => resolve(undefined),
                    RESPONSE_ERROR_BODY_TIMEOUT_MS
                );
            })
        ]);
        responseBody = bodyText ? JSON.parse(bodyText) : undefined;
    } catch {
        responseBody = undefined;
    } finally {
        if (timeoutId) {
            window.clearTimeout(timeoutId);
        }
    }

    console.error("QC workflow API request failed", {
        status: response.status,
        statusText: response.statusText,
        requestId,
        responseBody
    });

    return getFriendlyResponseErrorMessage(response);
};

const getUnknownErrorMessage = async (error: unknown): Promise<string> => {
    if (error instanceof Response) {
        return getResponseErrorMessage(error);
    }

    if (error instanceof TypeError) {
        console.error("QC workflow request failed", error);
        return "Unable to reach the service. Please check your connection and try again.";
    }

    if (error instanceof Error && error.message) {
        if (hasDebugDetails(error.message)) {
            console.error("QC workflow request failed", error);
            return "Unable to complete the request. Please try again.";
        }

        return error.message;
    }

    return "Unable to complete the request. Please try again.";
};

const getSubmitErrorMessage = async (error: unknown) => {
    if (error instanceof WorkflowSubmitError) {
        const detail = await getUnknownErrorMessage(error.originalError);
        return error.message.toLowerCase().startsWith("upload")
            ? `Unable to upload one or more photos. ${detail}`
            : `Unable to save one or more task updates. ${detail}`;
    }

    const detail = await getUnknownErrorMessage(error);
    return `Unable to save QC workflow updates. ${detail}`;
};

const runWorkflowOperations = async (operations: WorkflowOperation[]) => {
    for (const operation of operations) {
        try {
            await operation.run();
        } catch (error) {
            throw new WorkflowSubmitError(operation.label, error);
        }
    }
};

const readBlobAsArrayBuffer = (blob: Blob): Promise<ArrayBuffer> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });

const loadImageElement = (blob: Blob): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        const objectUrl = URL.createObjectURL(blob);

        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Unable to read image dimensions."));
        };
        image.src = objectUrl;
    });

const canvasToBlob = (
    canvas: HTMLCanvasElement,
    contentType: string,
    quality: number
): Promise<Blob> =>
    new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Unable to compress image."));
                }
            },
            contentType,
            quality
        );
    });

const prepareImageForUpload = async (file: File) => {
    const original = {
        blob: file,
        fileName: file.name,
        contentType: file.type
    };

    try {
        const image = await loadImageElement(file);
        const largestDimension = Math.max(image.naturalWidth, image.naturalHeight);
        const shouldCompress = largestDimension > MAX_ATTACHMENT_IMAGE_DIMENSION
            || file.size > IMAGE_ATTACHMENT_COMPRESSION_MIN_BYTES;

        if (!shouldCompress) {
            return original;
        }

        let bestBlob: Blob | undefined;

        for (const candidate of IMAGE_ATTACHMENT_COMPRESSION_CANDIDATES) {
            const scale = Math.min(1, candidate.dimension / largestDimension);
            const width = Math.max(1, Math.round(image.naturalWidth * scale));
            const height = Math.max(1, Math.round(image.naturalHeight * scale));
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");

            if (!context) {
                continue;
            }

            canvas.width = width;
            canvas.height = height;
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);

            const compressedBlob = await canvasToBlob(
                canvas,
                "image/jpeg",
                candidate.quality
            );

            if (!bestBlob || compressedBlob.size < bestBlob.size) {
                bestBlob = compressedBlob;
            }

            if (compressedBlob.size <= MAX_ATTACHMENT_UPLOAD_BYTES) {
                bestBlob = compressedBlob;
                break;
            }
        }

        if (!bestBlob || bestBlob.size >= file.size) {
            return original;
        }

        return {
            blob: bestBlob,
            fileName: toJpegFileName(file.name),
            contentType: bestBlob.type || "image/jpeg"
        };
    } catch {
        return original;
    }
};

const bytesToCanonicalBase64 = (bytes: Uint8Array) => {
    const binaryChunks: string[] = [];
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binaryChunks.push(String.fromCharCode(...chunk));
    }

    return btoa(binaryChunks.join("")).replace(/\s/g, "");
};

const fileToAttachment = async (file: File, index: number): Promise<WorkflowAttachment> => {
    if (!isImageFile(file)) {
        throw new Error(IMAGE_ATTACHMENTS_ONLY_ERROR);
    }

    const uploadImage = await prepareImageForUpload(file);
    const arrayBuffer = await readBlobAsArrayBuffer(uploadImage.blob);
    const bytes = new Uint8Array(arrayBuffer);

    if (bytes.byteLength > MAX_ATTACHMENT_UPLOAD_BYTES) {
        throw new Error(getAttachmentSizeError(uploadImage.fileName, bytes.byteLength));
    }

    const content = bytesToCanonicalBase64(bytes);

    return {
        id: `uploaded-${Date.now()}-${index}-${file.name}`,
        name: uploadImage.fileName,
        thumbnail: true,
        src: `data:${uploadImage.contentType};base64,${content}`,
        contentType: uploadImage.contentType,
        contentSize: bytes.byteLength,
        content
    };
};

const AttachmentList: FunctionalComponent<{
    attachments: WorkflowAttachment[];
    itemTitle: string;
    isLoading?: boolean;
    error?: string;
    onAddFiles: (files: File[]) => void;
    onImageLoadError: () => void;
    onPreviewAttachment: (attachment: WorkflowAttachment) => void;
    onUploadClick: () => void;
    onRemoveAttachment: (attachmentId: string) => void;
}> = ({
    attachments,
    itemTitle,
    isLoading,
    error,
    onAddFiles,
    onImageLoadError,
    onPreviewAttachment,
    onUploadClick,
    onRemoveAttachment
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="wo-workflow-attachments">
            {isLoading && (
                <span className="wo-workflow-attachment-status">Loading...</span>
            )}
            {attachments.map((attachment) =>
                attachment.thumbnail ? (
                    <span
                        className="wo-workflow-photo-thumb"
                        key={attachment.id}
                        aria-label="Attached photo"
                    >
                        {attachment.src && (
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
                        )}
                        {!attachment.isPersisted && (
                            <button
                                type="button"
                                className="wo-workflow-photo-remove"
                                aria-label={`Remove ${attachment.name || "attached photo"}`}
                                onClick={() => onRemoveAttachment(attachment.id)}
                            >
                                x
                            </button>
                        )}
                    </span>
                ) : (
                    <span className="wo-workflow-photo-name" key={attachment.id}>
                        <span className="wo-workflow-file-label">
                            {attachment.name}
                        </span>
                        {!attachment.isPersisted && (
                            <button
                                type="button"
                                className="wo-workflow-remove-button"
                                aria-label={`Remove ${attachment.name}`}
                                onClick={() => onRemoveAttachment(attachment.id)}
                            >
                                x
                            </button>
                        )}
                    </span>
                )
            )}
            {error && (
                <span className="wo-workflow-attachment-error" role="alert">
                    {error}
                </span>
            )}
            <button
                type="button"
                className="wo-workflow-camera-button"
                aria-label={`Attach photos to ${itemTitle}`}
                onClick={() => {
                    onUploadClick();
                    fileInputRef.current?.click();
                }}
            >
                <span className="wo-workflow-camera-icon" aria-hidden="true" />
            </button>
            <input
                ref={fileInputRef}
                className="wo-workflow-file-input"
                type="file"
                accept="image/*"
                multiple
                aria-label={`Attach photos to ${itemTitle}`}
                onChange={(event) => {
                    const input = event.currentTarget as HTMLInputElement;
                    const files = Array.from(input.files || []);

                    if (files.length > 0) {
                        onAddFiles(files);
                    }

                    input.value = "";
                }}
            />
        </div>
    );
};

const CommentsPanel: FunctionalComponent<{
    itemTitle: string;
    state: TaskCommentState;
    onDraftChange: (value: string) => void;
    onSubmit: () => void;
}> = ({
    itemTitle,
    state,
    onDraftChange,
    onSubmit
}) => (
    <div className="wo-workflow-comments-panel" aria-label={`Comments for ${itemTitle}`}>
        <div className="wo-workflow-comment-compose">
            <textarea
                aria-label={`Add comment for ${itemTitle}`}
                value={state.draft}
                disabled={state.isSubmitting}
                onInput={(event) => onDraftChange((event.currentTarget as HTMLTextAreaElement).value)}
            />
            <button
                type="button"
                className="wo-workflow-comment-submit"
                disabled={state.isSubmitting || !state.draft.trim()}
                onClick={onSubmit}
            >
                {state.isSubmitting ? "Adding..." : "Add comment"}
            </button>
        </div>

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

export const WorkOrderWorkflowView: FunctionalComponent<WorkOrderWorkflowViewProps> = ({
    workOrderId,
    vendorName,
    onBackToList,
    onBackToDetail
}) => {
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

    const [evaluationDrafts, setEvaluationDrafts] = useState<Record<string, EvaluationDraft>>({});
    const [fetchedAttachments, setFetchedAttachments] = useState<Record<string, WorkflowAttachment[]>>({});
    const [uploadedAttachments, setUploadedAttachments] = useState<Record<string, WorkflowAttachment[]>>({});
    const [removedAttachmentIds, setRemovedAttachmentIds] = useState<Record<string, string[]>>({});
    const [attachmentLoadErrors, setAttachmentLoadErrors] = useState<Record<string, string | undefined>>({});
    const [attachmentLoadingByTaskId, setAttachmentLoadingByTaskId] = useState<Record<string, boolean>>({});
    const [commentsByTaskId, setCommentsByTaskId] = useState<Record<string, TaskCommentState>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submittingAction, setSubmittingAction] = useState<WorkflowSubmitAction | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [activeImagePreview, setActiveImagePreview] = useState<WorkflowAttachment | null>(null);
    const isFetching = workOrderFetching || tasksFetching;
    const hasLoadError = Boolean(workOrderError || tasksError);
    const tasks = taskCollection?.items;
    const workflowSections = useMemo(
        () => buildWorkflowSections(tasks ?? []),
        [tasks]
    );
    const workflowEntries = useMemo(
        () => workflowSections.flatMap((section) => section.entries),
        [workflowSections]
    );
    const workflowUserName = getPortalVendorName(vendorName);
    const evaluableWorkflowEntries = tasks?.length
        ? workflowEntries.filter((entry) => !entry.isComplete)
        : [];
    const displayWorkOrderId = toWorkOrderLabel(workOrder?.id || workOrderId);
    const workflowTitle = workOrder?.displayName?.trim() || displayWorkOrderId;

    const getCompletionState = (entry: WorkflowItem) =>
        evaluationDrafts[entry.id]?.result
            ? evaluationDrafts[entry.id].result === "PASS"
            : entry.isComplete;
    const activeCommentEntry = workflowEntries.find((entry) =>
        getTaskCommentState(commentsByTaskId, entry.id).isOpen
    );
    const activeCommentState = activeCommentEntry
        ? getTaskCommentState(commentsByTaskId, activeCommentEntry.id)
        : undefined;

    useEffect(() => {
        if (!activeImagePreview) {
            return undefined;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setActiveImagePreview(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activeImagePreview]);

    const handleCompletionChange = (entry: WorkflowItem) => (event: Event) => {
        const checked = (event.currentTarget as HTMLInputElement).checked;
        setEvaluationDrafts((current) => {
            const nextDrafts = { ...current };

            if (checked) {
                nextDrafts[entry.id] = createEvaluationDraft(workflowUserName, true);
            } else {
                delete nextDrafts[entry.id];
            }

            return nextDrafts;
        });
    };

    const getAttachments = (entry: WorkflowItem) => {
        const removedIds = removedAttachmentIds[entry.id] ?? [];
        return [
            ...(fetchedAttachments[entry.id] ?? entry.attachments),
            ...(uploadedAttachments[entry.id] ?? [])
        ].filter((attachment) => !removedIds.includes(attachment.id));
    };

    const getUploadedAttachmentsToSave = (entry: WorkflowItem) => {
        const removedIds = removedAttachmentIds[entry.id] ?? [];

        return (uploadedAttachments[entry.id] ?? []).filter((attachment) =>
            !removedIds.includes(attachment.id)
            && Boolean(attachment.content)
            && Boolean(attachment.contentType?.startsWith("image/"))
        );
    };

    const handleAddAttachmentFiles = (entry: WorkflowItem) => async (files: File[]) => {
        const imageFiles = files.filter(isImageFile);
        const hasUnsupportedFiles = imageFiles.length !== files.length;

        if (imageFiles.length === 0) {
            setAttachmentLoadErrors((current) => ({
                ...current,
                [entry.id]: hasUnsupportedFiles ? IMAGE_ATTACHMENTS_ONLY_ERROR : undefined
            }));
            return;
        }

        try {
            const nextAttachments = await Promise.all(imageFiles.map(fileToAttachment));

            setAttachmentLoadErrors((current) => ({
                ...current,
                [entry.id]: hasUnsupportedFiles ? IMAGE_ATTACHMENTS_ONLY_ERROR : undefined
            }));
            setUploadedAttachments((current) => ({
                ...current,
                [entry.id]: [
                    ...(current[entry.id] ?? []),
                    ...nextAttachments.map((attachment) => ({
                        ...attachment,
                        createdBy: workflowUserName
                    }))
                ]
            }));
        } catch (error) {
            const errorMessage = error instanceof Error
                ? error.message
                : "Unable to attach one or more images.";

            setAttachmentLoadErrors((current) => ({
                ...current,
                [entry.id]: errorMessage
            }));
        }
    };

    const handleAttachmentUploadClick = (entry: WorkflowItem) => () => {
        setAttachmentLoadErrors((current) => ({
            ...current,
            [entry.id]: undefined
        }));
    };

    const handleRemoveAttachment = (entry: WorkflowItem) => (attachmentId: string) => {
        setRemovedAttachmentIds((current) => ({
            ...current,
            [entry.id]: [
                ...(current[entry.id] ?? []),
                attachmentId
            ]
        }));
    };

    const handleAttachmentImageLoadError = (entry: WorkflowItem) => () => {
        setAttachmentLoadErrors((current) => ({
            ...current,
            [entry.id]: PHOTO_LOAD_INLINE_ERROR
        }));
    };

    const updateTaskCommentState = (
        taskId: string,
        updater: (state: TaskCommentState) => TaskCommentState
    ) => {
        setCommentsByTaskId((current) => ({
            ...current,
            [taskId]: updater(getTaskCommentState(current, taskId))
        }));
    };

    useEffect(() => {
        if (!tasks?.length || workflowEntries.length === 0) {
            return;
        }

        let isActive = true;

        workflowEntries.forEach((entry) => {
            setAttachmentLoadingByTaskId((current) => ({
                ...current,
                [entry.id]: true
            }));
            setAttachmentLoadErrors((current) => ({
                ...current,
                [entry.id]: undefined
            }));

            void listQcTaskAttachments(entry.id)
                .then((attachments) => {
                    if (!isActive) {
                        return;
                    }

                    setFetchedAttachments((current) => ({
                        ...current,
                        [entry.id]: sortAttachmentsByNewest(attachments.items ?? [])
                            .map(createWorkflowAttachmentFromSummary)
                    }));
                    setAttachmentLoadingByTaskId((current) => ({
                        ...current,
                        [entry.id]: false
                    }));
                })
                .catch(() => {
                    if (!isActive) {
                        return;
                    }

                    setAttachmentLoadErrors((current) => ({
                        ...current,
                        [entry.id]: PHOTO_LOAD_INLINE_ERROR
                    }));
                    setAttachmentLoadingByTaskId((current) => ({
                        ...current,
                        [entry.id]: false
                    }));
                });
        });

        return () => {
            isActive = false;
        };
    }, [tasks, workflowEntries]);

    useEffect(() => {
        if (!tasks?.length || workflowEntries.length === 0) {
            return;
        }

        let isActive = true;

        workflowEntries.forEach((entry) => {
            updateTaskCommentState(entry.id, (state) => ({
                ...state,
                isLoading: !state.hasLoaded,
                error: undefined
            }));

            void listQcTaskComments(entry.id)
                .then((comments) => {
                    if (!isActive) {
                        return;
                    }

                    updateTaskCommentState(entry.id, (state) => ({
                        ...state,
                        items: sortCommentsByNewest(comments.items ?? []),
                        hasLoaded: true,
                        isLoading: false
                    }));
                })
                .catch((error) => {
                    if (!isActive) {
                        return;
                    }

                    void getUnknownErrorMessage(error).then((errorMessage) => {
                        if (!isActive) {
                            return;
                        }

                        updateTaskCommentState(entry.id, (state) => ({
                            ...state,
                            isLoading: false,
                            error: `Unable to load comments: ${errorMessage}`
                        }));
                    });
                });
        });

        return () => {
            isActive = false;
        };
    }, [tasks, workflowEntries]);

    const setOpenCommentTask = (taskId: string | null) => {
        setCommentsByTaskId((current) => {
            const next = Object.keys(current).reduce<Record<string, TaskCommentState>>((acc, currentTaskId) => {
                acc[currentTaskId] = {
                    ...current[currentTaskId],
                    isOpen: currentTaskId === taskId
                };
                return acc;
            }, {});

            if (taskId && !next[taskId]) {
                next[taskId] = {
                    ...createDefaultTaskCommentState(),
                    isOpen: true
                };
            }

            return next;
        });
    };

    const loadTaskComments = async (entry: WorkflowItem) => {
        setCommentsByTaskId((current) => {
            const next = Object.keys(current).reduce<Record<string, TaskCommentState>>((acc, taskId) => {
                acc[taskId] = {
                    ...current[taskId],
                    isOpen: false
                };
                return acc;
            }, {});
            next[entry.id] = {
                ...getTaskCommentState(current, entry.id),
                isOpen: true,
                isLoading: true,
                error: undefined
            };
            return next;
        });

        try {
            const comments = await listQcTaskComments(entry.id);
            updateTaskCommentState(entry.id, (state) => ({
                ...state,
                items: sortCommentsByNewest(comments.items ?? []),
                hasLoaded: true,
                isLoading: false
            }));
        } catch (error) {
            const errorMessage = await getUnknownErrorMessage(error);
            updateTaskCommentState(entry.id, (state) => ({
                ...state,
                isLoading: false,
                error: `Unable to load comments: ${errorMessage}`
            }));
        }
    };

    const handleToggleComments = (entry: WorkflowItem) => {
        const currentState = getTaskCommentState(commentsByTaskId, entry.id);

        if (currentState.isOpen) {
            setOpenCommentTask(null);
            return;
        }

        if (currentState.hasLoaded) {
            setOpenCommentTask(entry.id);
            return;
        }

        void loadTaskComments(entry);
    };

    const handleCommentDraftChange = (entry: WorkflowItem) => (value: string) => {
        updateTaskCommentState(entry.id, (state) => ({
            ...state,
            draft: value
        }));
    };

    const handleAddComment = (entry: WorkflowItem) => async () => {
        const commentState = getTaskCommentState(commentsByTaskId, entry.id);
        const commentText = commentState.draft.trim();

        if (!commentText) {
            return;
        }

        updateTaskCommentState(entry.id, (state) => ({
            ...state,
            isSubmitting: true,
            error: undefined
        }));

        try {
            const createdComment = await createQcTaskComment(
                entry.id,
                createCommentDetails(workflowUserName, commentText)
            );

            updateTaskCommentState(entry.id, (state) => ({
                ...state,
                items: sortCommentsByNewest([createdComment, ...state.items]),
                draft: "",
                isSubmitting: false,
                hasLoaded: true,
                isOpen: true
            }));
        } catch (error) {
            const errorMessage = await getUnknownErrorMessage(error);
            updateTaskCommentState(entry.id, (state) => ({
                ...state,
                isSubmitting: false,
                error: `Unable to add comment: ${errorMessage}`
            }));
        }
    };

    const persistWorkflowChanges = async (
        entries: WorkflowItem[],
        nextDrafts: Record<string, EvaluationDraft>
    ) => {
        const attachmentTimeCreated = new Date().toISOString();
        setSubmitError(null);
        setIsSubmitting(true);

        try {
            const attachmentOperations: WorkflowOperation[] = [];
            const evaluationOperations: WorkflowOperation[] = [];

            entries.forEach((entry) => {
                const details = nextDrafts[entry.id];

                if (details && !entry.isComplete) {
                    evaluationOperations.push({
                        label: `Evaluate "${entry.title}" as ${details.result}`,
                        run: () => evaluateQcTask(entry.id, details)
                    });
                }

                getUploadedAttachmentsToSave(entry).forEach((attachment) => {
                    const attachmentDetails = createAttachmentDetails(
                        workflowUserName,
                        entry,
                        attachment,
                        attachmentTimeCreated
                    );

                    if (attachmentDetails) {
                        attachmentOperations.push({
                            label: `Upload "${attachment.name}" for "${entry.title}"`,
                            run: () => createQcTaskAttachment(
                                entry.id,
                                attachmentDetails
                            )
                        });
                    }
                });
            });

            await runWorkflowOperations(attachmentOperations);
            await runWorkflowOperations(evaluationOperations);
        } catch (error) {
            setSubmitError(await getSubmitErrorMessage(error));
            throw error;
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveAndClose = async () => {
        const isFullyComplete = workflowEntries.length > 0
            && workflowEntries.every((entry) => getCompletionState(entry));

        setSubmittingAction("saveAndClose");

        try {
            await persistWorkflowChanges(workflowEntries, evaluationDrafts);
            onBackToDetail({ replaceHistory: isFullyComplete });
        } catch {
            // Error state is rendered above the action buttons.
        } finally {
            setSubmittingAction(null);
        }
    };

    const handleMarkComplete = () => {
        const completionTime = new Date().toISOString();

        setSubmitError(null);
        setEvaluationDrafts((current) =>
            evaluableWorkflowEntries.reduce<Record<string, EvaluationDraft>>(
                (drafts, entry) => ({
                    ...drafts,
                    [entry.id]: createEvaluationDraft(workflowUserName, true, completionTime)
                }),
                { ...current }
            )
        );
    };

    return (
        <div className="oj-web-applayout-max-width oj-web-applayout-content wo-workflow-page">
            <div className="wo-detail-breadcrumb wo-workflow-breadcrumb">
                <button type="button" className="wo-detail-breadcrumb-link" onClick={onBackToList}>
                    Work Orders
                </button>
                <span className="wo-detail-breadcrumb-separator">\</span>
                <button type="button" className="wo-detail-breadcrumb-link" onClick={() => onBackToDetail()}>
                    {displayWorkOrderId}
                </button>
                <span className="wo-detail-breadcrumb-separator">\</span>
                <span>QC Workflow</span>
            </div>

            {isFetching && !hasLoadError ? (
                <div className="wo-detail-empty">
                    <oj-c-progress-circle size="md" value={-1}></oj-c-progress-circle>
                    <div style={{ marginTop: "12px" }}>Loading QC workflow...</div>
                </div>
            ) : (
                <>
                    {hasLoadError && (
                        <div className="wo-workflow-load-note" role="status">
                            Showing the QC workflow layout while work order data is unavailable.
                        </div>
                    )}

                    <header className="wo-workflow-header">
                        <div className="wo-workflow-title">{workflowTitle}</div>
                        <div className="wo-workflow-meta">
                            <span>Room: <strong>{formatValue(workOrder?.roomId, "Unavailable")}</strong></span>
                            <span>Racks: <strong>{getRacksLabel(workOrder)}</strong></span>
                            <span>Vendor: <strong>{getVendorLabel(workOrder, tasks ?? [])}</strong></span>
                        </div>
                    </header>

                    <div className="wo-divider wo-workflow-divider" />

                    <div className="wo-workflow-shell">
                        <section className="wo-workflow-content">
                            <div className="wo-workflow-quick-links" aria-label="Work order links">
                                <button type="button" className="wo-workflow-link-button" onClick={() => onBackToDetail()}>
                                    View WO Details
                                </button>
                            </div>

                            <h2>Items to Be Addressed</h2>

                            <p className="wo-workflow-instruction">
                                <strong>1. Please address the following items discovered during the quality control check. When finished, click the checkbox to mark each item complete. You may optionally upload any supporting photos.</strong>
                            </p>

                            {workflowSections.map((section) => (
                                <section className="wo-workflow-section" key={section.key}>
                                    <h3>{section.title}</h3>

                                    {section.entries.length === 0 ? (
                                        <div className="wo-workflow-empty">No items</div>
                                    ) : (
                                        <div className="wo-workflow-table" role="table" aria-label={`${section.title} QC items`}>
                                            <div className="wo-workflow-table-row wo-workflow-table-header" role="row">
                                                <div role="columnheader">Item</div>
                                                <div role="columnheader">Attach Photos</div>
                                                <div role="columnheader">Comments</div>
                                                <div role="columnheader">Complete?</div>
                                            </div>

                                            {section.entries.map((entry) => {
                                                const isComplete = getCompletionState(entry);
                                                const commentState = getTaskCommentState(commentsByTaskId, entry.id);
                                                const commentButtonLabel = commentState.hasLoaded
                                                    ? `Comments (${commentState.items.length})`
                                                    : "Comments";

                                                return (
                                                    <div className="wo-workflow-table-row" role="row" key={entry.id}>
                                                        <div className="wo-workflow-item-cell" role="cell">
                                                            <span
                                                                className={[
                                                                    "wo-workflow-status",
                                                                    isComplete ? "wo-workflow-status-pass" : "wo-workflow-status-fail"
                                                                ].join(" ")}
                                                                aria-hidden="true"
                                                            />
                                                            <div className="wo-workflow-item-copy">
                                                                <div className="wo-workflow-item-title">{entry.title}</div>
                                                                {entry.detail && (
                                                                    <div className="wo-workflow-item-detail">{entry.detail}</div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <div className="wo-workflow-photos-cell" role="cell">
                                                            <AttachmentList
                                                                attachments={getAttachments(entry)}
                                                                itemTitle={entry.title}
                                                                isLoading={attachmentLoadingByTaskId[entry.id]}
                                                                error={attachmentLoadErrors[entry.id]}
                                                                onAddFiles={handleAddAttachmentFiles(entry)}
                                                                onImageLoadError={handleAttachmentImageLoadError(entry)}
                                                                onPreviewAttachment={setActiveImagePreview}
                                                                onUploadClick={handleAttachmentUploadClick(entry)}
                                                                onRemoveAttachment={handleRemoveAttachment(entry)}
                                                            />
                                                        </div>

                                                        <div className="wo-workflow-comment-action-cell" role="cell">
                                                            <button
                                                                type="button"
                                                                className="wo-workflow-comments-toggle"
                                                                aria-expanded={commentState.isOpen}
                                                                disabled={commentState.isLoading}
                                                                onClick={() => handleToggleComments(entry)}
                                                            >
                                                                {commentState.isLoading ? "Loading..." : commentButtonLabel}
                                                            </button>
                                                        </div>

                                                        <div className="wo-workflow-complete-cell" role="cell">
                                                            <input
                                                                type="checkbox"
                                                                aria-label={`Mark ${entry.title} complete`}
                                                                checked={isComplete}
                                                                disabled={isSubmitting || entry.isComplete}
                                                                onChange={handleCompletionChange(entry)}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            ))}

                            {submitError && (
                                <div className="wo-workflow-save-error" role="alert">
                                    {submitError}
                                </div>
                            )}

                            <div className="wo-workflow-footer-actions" aria-busy={isSubmitting}>
                                <oj-c-button label="Cancel" disabled={isSubmitting} onojAction={() => onBackToDetail()} />
                                <div className="wo-workflow-submit-actions">
                                    <oj-c-button
                                        label="Mark Complete"
                                        disabled={isSubmitting}
                                        onojAction={handleMarkComplete}
                                    />
                                    <oj-c-button
                                        chroming="callToAction"
                                        label={submittingAction === "saveAndClose" ? "Saving..." : "Save & Close"}
                                        disabled={isSubmitting}
                                        onojAction={handleSaveAndClose}
                                    />
                                </div>
                            </div>
                        </section>
                    </div>
                </>
            )}

            <oj-drawer-popup
                edge="end"
                modality="modal"
                auto-dismiss="none"
                opened={Boolean(activeCommentEntry)}
                onopenedChanged={(event: any) => {
                    if (!event.detail.value) {
                        setOpenCommentTask(null);
                    }
                }}
                class="wo-comments-drawer"
            >
                <div className="wo-comments-drawer-shell">
                    <div className="wo-comments-drawer-header">
                        <div>
                            <h3>Comments</h3>
                            <div className="wo-comments-drawer-subtitle">
                                {activeCommentEntry?.title ?? ""}
                            </div>
                        </div>
                        <oj-c-button
                            chroming="borderless"
                            display="icons"
                            label="Close"
                            onojAction={() => setOpenCommentTask(null)}
                        >
                            <span slot="startIcon" className="oj-ux-ico-close" />
                        </oj-c-button>
                    </div>
                    <div className="wo-comments-drawer-body">
                        {activeCommentEntry && activeCommentState && (
                            <CommentsPanel
                                itemTitle={activeCommentEntry.title}
                                state={activeCommentState}
                                onDraftChange={handleCommentDraftChange(activeCommentEntry)}
                                onSubmit={handleAddComment(activeCommentEntry)}
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
        </div>
    );
};
