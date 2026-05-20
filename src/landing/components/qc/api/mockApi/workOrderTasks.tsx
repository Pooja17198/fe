import type {
    QcTaskCollection,
    QcTaskLifecycleState
} from "../../../../../../gen/clients/ide-lvv-client";

type MockTaskDefinition = {
    taskKey: string;
    lifecycleState: QcTaskLifecycleState;
};

const taskDefinitions: MockTaskDefinition[] = [
    { taskKey: "general:Rack label applied", lifecycleState: "COMPLETED" },
    { taskKey: "general:Leveling feet down & rack level", lifecycleState: "COMPLETED" },
    { taskKey: "general:Power whip clearance verified", lifecycleState: "IN_PROGRESS" },
    { taskKey: "general:Rack anchoring complete", lifecycleState: "IN_PROGRESS" },
    { taskKey: "general:Grounding strap installed", lifecycleState: "IN_PROGRESS" },
    { taskKey: "general:No sharp edges or obstructions", lifecycleState: "IN_PROGRESS" },
    { taskKey: "cabling:Cable routing appropriate", lifecycleState: "IN_PROGRESS" },
    { taskKey: "cabling:Waterfall installed", lifecycleState: "IN_PROGRESS" },
    { taskKey: "cabling:Fiber bend radius within standard", lifecycleState: "IN_PROGRESS" },
    { taskKey: "cabling:Copper bundles dressed and secured", lifecycleState: "IN_PROGRESS" },
    { taskKey: "cabling:Slack loops are within standard", lifecycleState: "IN_PROGRESS" },
    { taskKey: "cabling:Cable tray path is clear", lifecycleState: "IN_PROGRESS" },
    { taskKey: "labeling:Rack location labels match plan", lifecycleState: "COMPLETED" },
    { taskKey: "labeling:Port labels legible and aligned", lifecycleState: "IN_PROGRESS" },
    { taskKey: "labeling:Cable labels match source and destination", lifecycleState: "IN_PROGRESS" },
    { taskKey: "patch-panel:Patch panel doors close cleanly", lifecycleState: "IN_PROGRESS" },
    { taskKey: "patch-panel:Patch panel ports are undamaged", lifecycleState: "IN_PROGRESS" },
    { taskKey: "comments:Installer notes reviewed", lifecycleState: "COMPLETED" }
];

const toTaskId = (workOrderId: string, taskKey: string) =>
    `${workOrderId}-${taskKey.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`;

const createTasksForWorkOrder = (workOrderId: string): QcTaskCollection => ({
    items: taskDefinitions.map((definition, index) => ({
        id: toTaskId(workOrderId, definition.taskKey),
        workOrderId,
        taskKey: definition.taskKey,
        vendorName: "namename",
        lifecycleState: definition.lifecycleState,
        timeCreated: "2024-08-21T10:00:00Z",
        timeUpdated: `2024-08-21T${String(11 + Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 10).padStart(2, "0")}:00Z`,
        timeStarted: "2024-08-21T10:15:00Z",
        timeCompleted: definition.lifecycleState === "COMPLETED"
            ? `2024-08-21T${String(11 + Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 10).padStart(2, "0")}:00Z`
            : undefined
    }))
});

export default createTasksForWorkOrder;
