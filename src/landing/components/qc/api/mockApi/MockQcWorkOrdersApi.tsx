import {
    QcApiCreateQcTaskAttachmentArgs,
    QcApiCreateQcTaskCommentArgs,
    QcApiCreateQcWorkOrderArgs,
    QcApiEvaluateQcTaskArgs,
    QcApiGetQcWorkOrderArgs,
    QcApiListQcTaskAttachmentsArgs,
    QcApiListQcTaskCommentsArgs,
    QcApiListQcWorkOrderTasksArgs,
    QcTaskAttachmentCollection,
    QcTaskAttachmentSummary,
    QcTaskCollection,
    QcTaskCommentCollection,
    QcTaskCommentSummary,
    QcTaskSummary,
    QcWorkOrder,
    QcWorkOrderLifecycleState
} from "../../../../../../gen/clients/ide-lvv-client";
import {
    makeResponseWithData,
    makeResponseWithLastPageData,
    withDelay
} from "../../../cabling/api/mockAPI/mockServiceHelper";
import workOrders from "./workOrders";
import createTasksForWorkOrder from "./workOrderTasks";

const mockCommentsByTaskId: Record<string, QcTaskCommentSummary[]> = {};
const mockAttachmentsByTaskId: Record<string, Array<QcTaskAttachmentSummary & { content?: string }>> = {};

const normalizeWorkOrderState = (value: unknown): QcWorkOrderLifecycleState => {
    const state = String(value ?? "").toUpperCase();
    if (state.includes("FAIL")) {
        return "FAILED";
    }
    if (state.includes("COMPLETE") || state.includes("READY") || state.includes("SUCCESS")) {
        return "SUCCEEDED";
    }
    return "IN_PROGRESS";
};

const getMockWorkOrder = (workOrderId: string): QcWorkOrder => {
    const summary = workOrders.items.find((item) => item.id === workOrderId) ?? workOrders.items[0];

    return {
        id: workOrderId,
        workOrderDefinitionId: summary.workOrderDefinitionId,
        displayName: summary.displayName,
        timeCreated: summary.timeCreated,
        timeUpdated: summary.timeUpdated,
        regionId: summary.regionId,
        buildingId: summary.buildingId,
        roomId: summary.roomId,
        rackLocationId: summary.rackLocationId,
        createdBy: summary.createdBy,
        vendorName: summary.vendorName ?? undefined,
        lifecycleState: normalizeWorkOrderState(summary.lifecycleState)
    };
};

const getMockCommentsForTask = (taskId: string): QcTaskCommentSummary[] => {
    if (!mockCommentsByTaskId[taskId]) {
        mockCommentsByTaskId[taskId] = taskId.includes("waterfall")
            ? [
                {
                    commentId: `${taskId}-comment-1`,
                    taskId,
                    createdBy: "namename",
                    comment: "Some comment here about the waterfall installation...",
                    timeCreated: "2024-08-21T11:20:00Z"
                }
            ]
            : [];
    }

    return mockCommentsByTaskId[taskId];
};

export class MockQcWorkOrdersApi {
    public static async createQcTaskAttachment(
        params: QcApiCreateQcTaskAttachmentArgs
    ): Promise<{ response: Response; data: QcTaskAttachmentSummary }> {
        return withDelay(() => {
            const attachments = mockAttachmentsByTaskId[params.taskId] ?? [];
            const attachment = {
                attachmentId: `${params.taskId}-attachment-${Date.now()}`,
                taskId: params.taskId,
                createdBy: params.createQcTaskAttachmentDetails.createdBy,
                fileName: params.createQcTaskAttachmentDetails.fileName,
                contentType: params.createQcTaskAttachmentDetails.contentType,
                contentSize: params.createQcTaskAttachmentDetails.contentSize,
                timeCreated: params.createQcTaskAttachmentDetails.timeCreated,
                content: params.createQcTaskAttachmentDetails.content
            };

            attachments.push(attachment);
            mockAttachmentsByTaskId[params.taskId] = attachments;

            return makeResponseWithData(attachment);
        });
    }

    public static async createQcWorkOrder(
        params: QcApiCreateQcWorkOrderArgs
    ): Promise<{ response: Response; data: QcWorkOrder }> {
        return withDelay(() => {
            const workOrderId = `mock-${Date.now()}`;
            const details = params.createQcWorkOrderDetails;

            return makeResponseWithData({
                id: workOrderId,
                ...details,
                timeCreated: new Date().toISOString(),
                timeUpdated: new Date().toISOString(),
                lifecycleState: "IN_PROGRESS",
                tasks: createTasksForWorkOrder(workOrderId).items
            } as any);
        });
    }

    public static async createQcTaskComment(
        params: QcApiCreateQcTaskCommentArgs
    ): Promise<{ response: Response; data: QcTaskCommentSummary }> {
        return withDelay(() => {
            const comments = getMockCommentsForTask(params.taskId);
            const comment: QcTaskCommentSummary = {
                commentId: `${params.taskId}-comment-${Date.now()}`,
                taskId: params.taskId,
                createdBy: params.createQcTaskCommentDetails.createdBy,
                comment: params.createQcTaskCommentDetails.comment,
                timeCreated: params.createQcTaskCommentDetails.timeCreated
            };

            comments.push(comment);
            return makeResponseWithData(comment);
        });
    }

    public static async getQcWorkOrder(
        params: QcApiGetQcWorkOrderArgs
    ): Promise<{ response: Response; data: QcWorkOrder }> {
        return withDelay(() =>
            makeResponseWithData(getMockWorkOrder(params.workOrderId))
        );
    }

    public static async listQcWorkOrderTasks(
        params: QcApiListQcWorkOrderTasksArgs
    ): Promise<{ response: Response; data: QcTaskCollection }> {
        return withDelay(() =>
            makeResponseWithLastPageData(createTasksForWorkOrder(params.workOrderId))
        );
    }

    public static async listQcTaskComments(
        params: QcApiListQcTaskCommentsArgs
    ): Promise<{ response: Response; data: QcTaskCommentCollection }> {
        return withDelay(() =>
            makeResponseWithLastPageData({
                items: [...getMockCommentsForTask(params.taskId)]
            })
        );
    }

    public static async listQcTaskAttachments(
        params: QcApiListQcTaskAttachmentsArgs
    ): Promise<{ response: Response; data: QcTaskAttachmentCollection }> {
        return withDelay(() => {
            const attachments = [...(mockAttachmentsByTaskId[params.taskId] ?? [])].sort((a, b) => {
                const aTime = new Date(a.timeCreated).getTime();
                const bTime = new Date(b.timeCreated).getTime();

                return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
            });

            return makeResponseWithLastPageData({
                items: attachments
            });
        });
    }

    public static async evaluateQcTask(
        params: QcApiEvaluateQcTaskArgs
    ): Promise<{ response: Response; data: QcTaskSummary }> {
        return withDelay(() =>
            makeResponseWithData({
                id: params.taskId,
                workOrderId: "mock",
                lifecycleState: params.evaluateQcTaskDetails.result === "PASS" ? "COMPLETED" : "FAILED",
                timeUpdated: params.evaluateQcTaskDetails.timeEvaluated,
                timeCompleted: params.evaluateQcTaskDetails.result === "PASS"
                    ? params.evaluateQcTaskDetails.timeEvaluated
                    : undefined,
                vendorName: params.evaluateQcTaskDetails.evaluatedBy
            })
        );
    }
}
