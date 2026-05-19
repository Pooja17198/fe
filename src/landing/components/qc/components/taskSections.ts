import type { QcTaskSummary } from "../../../../../gen/clients/ide-lvv-client";

export type TaskSectionKey = "general" | "cabling" | "labeling" | "patch-panel";

export type TaskSection = {
    key: TaskSectionKey;
    title: string;
};

type TaskDisplayLabelDefinition = {
    sectionKey: TaskSectionKey;
    label: string;
    backendIds?: string[];
    aliases?: string[];
};

export const TASK_SECTIONS: TaskSection[] = [
    { key: "general", title: "General" },
    { key: "cabling", title: "Cabling" },
    { key: "labeling", title: "Labeling" },
    { key: "patch-panel", title: "Patch Panel" }
];

const SECTION_ALIASES: Record<string, TaskSectionKey> = {
    general: "general",
    cabling: "cabling",
    cable: "cabling",
    labeling: "labeling",
    labels: "labeling",
    label: "labeling",
    "patch-panel": "patch-panel",
    patchpanel: "patch-panel",
    patch: "patch-panel",
    panel: "patch-panel",
    comments: "general",
    comment: "general",
    notes: "general",
    note: "general"
};

const LEADING_SECTION_PREFIXES: Array<[string, TaskSectionKey]> = [
    ["patch-panel", "patch-panel"],
    ["patchpanel", "patch-panel"],
    ["general", "general"],
    ["cabling", "cabling"],
    ["labeling", "labeling"],
    ["labels", "labeling"],
    ["comments", "general"]
];

const normalizeSectionToken = (value: string) =>
    value
        .trim()
        .toLowerCase()
        .replace(/[_\s]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

const normalizeTaskText = (value: string) =>
    normalizeSectionToken(value).replace(/-/g, " ");

const normalizeTaskLabel = (value: string) =>
    value
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const TASK_DISPLAY_LABELS: TaskDisplayLabelDefinition[] = [
    {
        sectionKey: "general",
        label: "Rack label applied",
        backendIds: ["general rack label", "general rack label applied"]
    },
    {
        sectionKey: "general",
        label: "Leveling feet down & Rack level",
        backendIds: ["general rack level"],
        aliases: [
            "general leveling feet down rack level",
            "general leveling feet down and rack level",
            "general leveling feet down & rack level"
        ]
    },
    {
        sectionKey: "general",
        label: "Waterfall installed",
        backendIds: ["general waterfall", "general waterfall installed"]
    },
    {
        sectionKey: "general",
        label: "rPDU label applied & matches receptacle/tapbox",
        backendIds: [
            "general rpdu label",
            "general rpdu label applied",
            "general rpdu label applied matches receptacle tapbox",
            "general rpdu label applied and matches receptacle tapbox"
        ]
    },
    {
        sectionKey: "general",
        label: "Rack grounded",
        backendIds: ["general rack grounded"],
        aliases: ["Grounding strap installed"]
    },
    {
        sectionKey: "general",
        label: "Rack energized to rPDU",
        backendIds: ["general rack energized", "general rack energized to rpdu", "general rack power"]
    },
    {
        sectionKey: "cabling",
        label: "Dressed properly",
        backendIds: ["cabling dressed properly"],
        aliases: ["Copper bundles dressed and secured", "cabling dressed"]
    },
    {
        sectionKey: "cabling",
        label: "Adheres to OCI Cabling Standards",
        backendIds: [
            "cabling standards",
            "cabling oci cabling standards",
            "cabling adheres to oci cabling standards"
        ]
    },
    {
        sectionKey: "cabling",
        label: "Cable routing appropriate",
        backendIds: [
            "cabling routing",
            "cabling cable routing",
            "cabling cable routing appropriate"
        ]
    },
    {
        sectionKey: "cabling",
        label: "Bend radius appropriate",
        backendIds: ["cabling bend radius", "cabling bend radius appropriate"],
        aliases: ["Fiber bend radius within standard"]
    },
    {
        sectionKey: "cabling",
        label: "Basket dressed",
        backendIds: ["cabling basket dressed"],
        aliases: ["Cable tray path is clear"]
    },
    {
        sectionKey: "cabling",
        label: "Cables connecting from correct side",
        backendIds: [
            "cabling correct side",
            "cabling cables connecting from correct side"
        ]
    },
    {
        sectionKey: "labeling",
        label: "Labels legible",
        backendIds: ["labeling labels legible", "labeling legible"],
        aliases: ["Port labels legible and aligned"]
    },
    {
        sectionKey: "labeling",
        label: "All cables labeled",
        backendIds: ["labeling cables labeled", "labeling all cables labeled", "labeling labeled"],
        aliases: ["Cable labels match source and destination"]
    },
    {
        sectionKey: "labeling",
        label: "Labels attached",
        backendIds: ["labeling attached"],
        aliases: ["All labels attached"]
    },
    {
        sectionKey: "patch-panel",
        label: "Patch matrix present",
        backendIds: [
            "patch panel matrix",
            "patch panel patch matrix",
            "patch panel patch matrix present",
            "patch-panel patch matrix present"
        ]
    },
    {
        sectionKey: "patch-panel",
        label: "Patch panel labeled",
        backendIds: [
            "patch panel labeled",
            "patch panel patch panel labeled",
            "patch-panel patch panel labeled"
        ]
    },
    {
        sectionKey: "patch-panel",
        label: "Cabling dressed front and rear",
        backendIds: [
            "patch panel cabling dressed",
            "patch panel cabling dressed front and rear",
            "patch-panel cabling dressed front and rear",
            "patch panel cables dressed"
        ]
    }
];

const TASK_DISPLAY_LABEL_BY_TEXT = TASK_DISPLAY_LABELS.reduce<
    Record<string, TaskDisplayLabelDefinition>
>((acc, definition) => {
    [
        definition.label,
        ...(definition.backendIds ?? []),
        ...(definition.aliases ?? [])
    ].forEach((value) => {
        acc[normalizeTaskLabel(value)] = definition;
    });

    return acc;
}, {});

const getTaskDisplayLabelDefinition = (value?: string) =>
    value ? TASK_DISPLAY_LABEL_BY_TEXT[normalizeTaskLabel(value)] : undefined;

const getTaskKey = (task: QcTaskSummary) => task.taskKey || task.id || "";

const toTaskSectionKey = (value: string): TaskSectionKey | undefined =>
    SECTION_ALIASES[normalizeSectionToken(value)];

const parseExplicitSection = (taskKey: string) => {
    const explicitMatch = taskKey.match(/^\s*([^:|/]+?)\s*(?::|\||\/)\s*(.+)$/);
    if (explicitMatch) {
        const sectionKey = toTaskSectionKey(explicitMatch[1]);
        if (sectionKey) {
            return { sectionKey, title: explicitMatch[2] };
        }
    }

    const dashMatch = taskKey.match(/^\s*([a-z][a-z0-9 _-]*?)\s+-\s+(.+)$/i);
    if (dashMatch) {
        const sectionKey = toTaskSectionKey(dashMatch[1]);
        if (sectionKey) {
            return { sectionKey, title: dashMatch[2] };
        }
    }

    return undefined;
};

const inferSectionFromLeadingText = (taskKey: string): TaskSectionKey | undefined => {
    const normalizedTaskKey = normalizeSectionToken(taskKey);
    const matchingPrefix = LEADING_SECTION_PREFIXES.find(([prefix]) =>
        normalizedTaskKey === prefix || normalizedTaskKey.startsWith(`${prefix}-`)
    );

    return matchingPrefix?.[1];
};

const inferSectionFromTaskText = (taskKey: string): TaskSectionKey => {
    const text = normalizeTaskText(taskKey);

    if (/\b(patch|panel)\b/.test(text)) {
        return "patch-panel";
    }
    if (/\b(label|labels|labeling)\b/.test(text)) {
        return "labeling";
    }
    if (/\b(cable|cabling|routing|waterfall|fiber|bend|copper|slack|tray)\b/.test(text)) {
        return "cabling";
    }

    return "general";
};

export const getTaskSectionKey = (task: QcTaskSummary): TaskSectionKey => {
    const taskKey = getTaskKey(task);
    const explicitSection = parseExplicitSection(taskKey);

    return explicitSection?.sectionKey
        ?? getTaskDisplayLabelDefinition(explicitSection?.title)?.sectionKey
        ?? getTaskDisplayLabelDefinition(taskKey)?.sectionKey
        ?? inferSectionFromLeadingText(taskKey)
        ?? inferSectionFromTaskText(taskKey);
};

export const getTaskTitle = (task: QcTaskSummary) => {
    const taskKey = getTaskKey(task);
    const explicitSection = parseExplicitSection(taskKey);
    const title = explicitSection?.title || taskKey;

    return getTaskDisplayLabelDefinition(title)?.label
        ?? getTaskDisplayLabelDefinition(taskKey)?.label
        ?? title
        ?? "Unavailable";
};
