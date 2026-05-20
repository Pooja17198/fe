import { h, FunctionalComponent } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import ArrayDataProvider from "ojs/ojarraydataprovider";

import "ojs/ojdrawerpopup";
import "ojs/ojformlayout";
import "oj-c/button";
import "oj-c/select-single";
import "oj-c/input-text";
import "oj-c/progress-circle";

import {
    usePlatformListByRoom,
    useRoomMetadata
} from "../../cabling/api/hooks/materialApi";
import { AdrBuilding, isAdrBuilding } from "../../cabling/types";
import {
    createQcTaskAttachment,
    createQcTaskComment,
    createQcWorkOrderAndGetTasks,
    evaluateQcTask
} from "../api/hooks/qcApi";
import type {
    CreateQcTaskAttachmentDetails,
    CreateQcTaskCommentDetails,
    CreateQcWorkOrderDetails,
    EvaluateQcTaskDetails,
    QcTaskSummary,
    RoomPlatform
} from "../../../../../gen/clients/ide-lvv-client";
import {
    TASK_SECTIONS,
    getTaskSectionKey,
    getTaskTitle as getBaseTaskTitle
} from "./taskSections";
import type { TaskSectionKey } from "./taskSections";

type CreateWorkOrderDrawerProps = {
    opened: boolean;
    initialSiteName?: string;
    vendorName?: string;
    onClose: () => void;
    onCreate?: () => void;
};

type SelectOption = {
    label: string;
    value: string;
};

type CreateWorkOrderFieldErrors = {
    displayName?: string;
    siteName?: string;
    vendor?: string;
    racks?: string;
};

type UploadedPhoto = {
    id: string;
    name: string;
    src: string;
    contentType: string;
    contentSize: number;
    content: string;
};

type CreateQcWorkOrderPayload = CreateQcWorkOrderDetails & {
    buildingId: string;
    regionId?: string;
    vendorName: string;
};

type CreateQcTaskAttachmentPayload = CreateQcTaskAttachmentDetails & {
    emailAddress: string;
    notes: string;
};

type CreateQcTaskCommentPayload = CreateQcTaskCommentDetails & {
    emailAddress: string;
};

type CreateTaskPresentation = {
    task: QcTaskSummary;
    taskId: string;
    title: string;
    sectionKey: TaskSectionKey;
};

const WORK_ORDER_DEFINITION_ID = "1";
const DEFAULT_PORTAL_VENDOR_NAME = "LVV Portal Vendor";
const IMAGE_ATTACHMENTS_ONLY_ERROR = "Only image files can be attached.";

const getPortalVendorName = (vendorName?: string) =>
    vendorName?.trim() || DEFAULT_PORTAL_VENDOR_NAME;

const toUniqueRoomOptions = (roomMetadata: readonly AdrBuilding[]): SelectOption[] =>
    roomMetadata
        .map((item) => ({
            label: item.roomCanonicalName,
            value: item.roomCanonicalName,
        }))
        .filter(
            (room, index, self) =>
                index === self.findIndex((option) => option.value === room.value)
        )
        .filter((option) => typeof option.value === "string");

const toRackOptions = (roomPlatforms: readonly RoomPlatform[]): SelectOption[] =>
    roomPlatforms
        .map((platform) => platform.rackNumber?.trim())
        .filter((rackNumber): rackNumber is string => Boolean(rackNumber))
        .filter((rackNumber, index, self) => self.indexOf(rackNumber) === index)
        .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
        .map((rackNumber) => ({
            label: rackNumber,
            value: rackNumber
        }));

const getCreateTaskId = (task: QcTaskSummary, index: number) =>
    task.id || `created-task-${index}`;

const getCreateTaskPresentation = (
    task: QcTaskSummary,
    index: number
): CreateTaskPresentation => {
    const title = getBaseTaskTitle(task).replace(/[_-]+/g, " ");

    return {
        task,
        taskId: getCreateTaskId(task, index),
        title,
        sectionKey: getTaskSectionKey(task)
    };
};

const readImageFile = (file: File): Promise<UploadedPhoto> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const src = String(reader.result || "");
            const contentType = file.type || src.match(/^data:([^;]+);base64,/)?.[1] || "image/jpeg";

            resolve({
                id: `${file.name}-${file.lastModified}-${Date.now()}`,
                name: file.name,
                src,
                contentType,
                contentSize: file.size,
                content: src.includes(",") ? src.split(",").slice(1).join(",") : src,
            });
        };

        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

const isImageFile = (file: File) => file.type.startsWith("image/");

const buildDefaultDisplayName = (room: string, rack: string) =>
    room && rack ? `QC Work Order ${room} ${rack}` : "";

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
    let responseBody: unknown;

    try {
        const bodyText = await response.clone().text();
        responseBody = bodyText ? JSON.parse(bodyText) : undefined;
    } catch {
        responseBody = undefined;
    }

    console.error("Create QC work order request failed", {
        status: response.status,
        statusText: response.statusText,
        requestId: response.headers.get("opc-request-id"),
        responseBody
    });

    return getFriendlyResponseErrorMessage(response);
};

const getUnknownErrorMessage = async (error: unknown) => {
    if (error instanceof Response) {
        return getResponseErrorMessage(error);
    }

    if (error instanceof TypeError) {
        console.error("Create QC work order request failed", error);
        return "Unable to reach the service. Please check your connection and try again.";
    }

    if (error instanceof Error && error.message) {
        if (hasDebugDetails(error.message)) {
            console.error("Create QC work order request failed", error);
            return "Unable to complete the request. Please try again.";
        }

        return error.message;
    }

    return "Unable to complete the request. Please try again.";
};

const createAttachmentDetails = (
    createdBy: string,
    taskTitle: string,
    photo: UploadedPhoto,
    timeCreated: string
): CreateQcTaskAttachmentPayload => ({
    fileName: photo.name,
    contentType: photo.contentType,
    contentSize: photo.contentSize,
    createdBy,
    emailAddress: createdBy,
    notes: taskTitle,
    timeCreated,
    content: photo.content
});

const createPassedTaskEvaluation = (
    evaluatedBy: string,
    timeEvaluated: string
): EvaluateQcTaskDetails => ({
    result: "PASS",
    evaluatedBy,
    timeEvaluated
});

const createTaskCommentDetails = (
    createdBy: string,
    comment: string,
    timeCreated: string
): CreateQcTaskCommentPayload => ({
    comment,
    createdBy,
    emailAddress: createdBy,
    timeCreated
});

export const CreateWorkOrderDrawer: FunctionalComponent<CreateWorkOrderDrawerProps> =
    ({ opened, initialSiteName, vendorName, onClose, onCreate }) => {
        const [selectedRoom, setSelectedRoom] = useState("");
        const [displayName, setDisplayName] = useState("");
        const [displayNameEdited, setDisplayNameEdited] = useState(false);
        const [vendor, setVendor] = useState("");
        const [selectedRack, setSelectedRack] = useState("");
        const [rackOptions, setRackOptions] = useState<SelectOption[]>([]);
        const [isLoadingRacks, setIsLoadingRacks] = useState(false);
        const [rackLoadError, setRackLoadError] = useState("");
        const [fieldErrors, setFieldErrors] = useState<CreateWorkOrderFieldErrors>({});
        const [createdWorkOrderId, setCreatedWorkOrderId] = useState("");
        const [createdTasks, setCreatedTasks] = useState<QcTaskSummary[]>([]);
        const [passedTaskIds, setPassedTaskIds] = useState<Record<string, boolean>>({});
        const [photosByTaskId, setPhotosByTaskId] = useState<Record<string, UploadedPhoto[]>>({});
        const [notesByTaskId, setNotesByTaskId] = useState<Record<string, string>>({});
        const [openNoteTaskIds, setOpenNoteTaskIds] = useState<Record<string, boolean>>({});
        const [isCreating, setIsCreating] = useState(false);
        const [isFinalizing, setIsFinalizing] = useState(false);
        const [createError, setCreateError] = useState("");
        const shouldFetchRackOptionsRef = useRef(false);

        const { data: adrBuildingData } = useRoomMetadata();
        const {
            data: roomPlatforms,
            error: roomPlatformsError,
            isFetching: roomPlatformsLoading,
            refetch: refetchRoomPlatforms,
            variables: roomPlatformVariables
        } = usePlatformListByRoom();
        const loadedRoomPlatformRoomName = roomPlatformVariables[0];

        const roomMetadata = useMemo(
            () => adrBuildingData?.filter(isAdrBuilding) ?? [],
            [adrBuildingData]
        );

        const roomInfo = useMemo(
            () => new ArrayDataProvider(toUniqueRoomOptions(roomMetadata), {
                keyAttributes: "value",
            }),
            [roomMetadata]
        );

        const rackInfo = useMemo(
            () => new ArrayDataProvider(rackOptions, {
                keyAttributes: "value",
            }),
            [rackOptions]
        );

        const selectedRoomMetadata = useMemo(
            () => roomMetadata.find((room) => room.roomCanonicalName === selectedRoom),
            [roomMetadata, selectedRoom]
        );

        const hasCreatedWorkOrder = Boolean(createdWorkOrderId || createdTasks.length);
        const isWorkOrderFormLocked = hasCreatedWorkOrder || isCreating || isFinalizing;
        const portalVendorName = getPortalVendorName(vendorName);
        const clearFieldError = (fieldName: keyof CreateWorkOrderFieldErrors) => {
            setFieldErrors((current) => {
                if (!current[fieldName]) {
                    return current;
                }

                const next = { ...current };
                delete next[fieldName];
                return next;
            });
        };
        const groupedCreatedTaskSections = useMemo(() => {
            const groupedEntries = TASK_SECTIONS.reduce((acc, section) => {
                acc[section.key] = [];
                return acc;
            }, {} as Record<TaskSectionKey, CreateTaskPresentation[]>);

            createdTasks.forEach((task, index) => {
                const taskPresentation = getCreateTaskPresentation(task, index);
                groupedEntries[taskPresentation.sectionKey].push(taskPresentation);
            });

            return TASK_SECTIONS.map((section) => ({
                ...section,
                tasks: groupedEntries[section.key]
            }));
        }, [createdTasks]);

        useEffect(() => {
            if (!opened) {
                return;
            }

            const nextSelectedRoom = initialSiteName || "";
            setSelectedRoom(nextSelectedRoom);
            setSelectedRack("");
            setRackOptions([]);
            setRackLoadError("");
            setDisplayName(buildDefaultDisplayName(nextSelectedRoom, ""));
            setDisplayNameEdited(false);
            setFieldErrors({});
        }, [opened, initialSiteName]);

        useEffect(() => {
            if (!opened || !selectedRoom) {
                shouldFetchRackOptionsRef.current = false;
                setRackOptions([]);
                setSelectedRack("");
                setRackLoadError("");
                setIsLoadingRacks(false);
                return;
            }

            shouldFetchRackOptionsRef.current = true;
            setRackOptions([]);
            setSelectedRack("");
            setRackLoadError("");
            setIsLoadingRacks(true);
        }, [opened, selectedRoom]);

        useEffect(() => {
            if (
                !opened ||
                !selectedRoom ||
                roomPlatformsLoading ||
                shouldFetchRackOptionsRef.current ||
                loadedRoomPlatformRoomName !== selectedRoom
            ) {
                return;
            }

            if (roomPlatformsError) {
                console.error("Failed to load room racks", roomPlatformsError);
                setRackOptions([]);
                setSelectedRack("");
                setRackLoadError("Unable to load racks for the selected site.");
                setIsLoadingRacks(false);
                return;
            }

            const nextOptions = toRackOptions(roomPlatforms);
            setRackOptions(nextOptions);
            setSelectedRack(nextOptions[0]?.value ?? "");
            if (nextOptions.length > 0) {
                setFieldErrors((current) => {
                    if (!current.racks) {
                        return current;
                    }

                    const next = { ...current };
                    delete next.racks;
                    return next;
                });
            }
            setRackLoadError(
                nextOptions.length === 0
                    ? "No racks were returned for the selected site."
                    : ""
            );
            setIsLoadingRacks(false);
        }, [
            loadedRoomPlatformRoomName,
            opened,
            roomPlatforms,
            roomPlatformsError,
            roomPlatformsLoading,
            selectedRoom
        ]);

        useEffect(() => {
            if (
                !opened ||
                !selectedRoom ||
                roomPlatformsLoading ||
                !shouldFetchRackOptionsRef.current
            ) {
                return;
            }

            shouldFetchRackOptionsRef.current = false;
            refetchRoomPlatforms(selectedRoom);
        }, [opened, roomPlatformsLoading, selectedRoom]);

        useEffect(() => {
            if (!opened || displayNameEdited) {
                return;
            }

            setDisplayName(buildDefaultDisplayName(selectedRoom, selectedRack));
        }, [displayNameEdited, opened, selectedRack, selectedRoom]);

        useEffect(() => {
            if (opened) {
                return;
            }

            setCreatedWorkOrderId("");
            setCreatedTasks([]);
            setPassedTaskIds({});
            setPhotosByTaskId({});
            setNotesByTaskId({});
            setOpenNoteTaskIds({});
            setIsCreating(false);
            setIsFinalizing(false);
            setCreateError("");
            setFieldErrors({});
        }, [opened]);

        const buildCreateDetails = (): CreateQcWorkOrderPayload | null => {
            const normalizedDisplayName = displayName.trim();
            const vendorName = vendor.trim();
            const nextFieldErrors: CreateWorkOrderFieldErrors = {};

            if (!normalizedDisplayName) {
                nextFieldErrors.displayName = "WO Title is mandatory.";
            }

            if (!vendorName) {
                nextFieldErrors.vendor = "Vendor is mandatory.";
            }

            if (!selectedRoom) {
                nextFieldErrors.siteName = "Room Name is mandatory.";
            } else if (!selectedRoomMetadata?.buildingCanonicalName) {
                nextFieldErrors.siteName = "Building is unavailable for the selected site.";
            }

            if (!selectedRack) {
                nextFieldErrors.racks = "Rack ID is mandatory.";
            }

            setFieldErrors(nextFieldErrors);

            if (Object.keys(nextFieldErrors).length > 0) {
                setCreateError("");
                return null;
            }

            if (!portalVendorName) {
                setCreateError("Unable to determine the LVV Portal vendor name.");
                return null;
            }

            const selectedBuildingId = selectedRoomMetadata?.buildingCanonicalName;
            if (!selectedBuildingId) {
                setFieldErrors({ siteName: "Building is unavailable for the selected site." });
                setCreateError("");
                return null;
            }

            return {
                workOrderDefinitionId: WORK_ORDER_DEFINITION_ID,
                displayName: normalizedDisplayName,
                regionId: selectedRoomMetadata?.regionDisplayName,
                buildingId: selectedBuildingId,
                roomId: selectedRoom,
                rackLocationId: selectedRack,
                createdBy: portalVendorName,
                vendorName: vendorName,
            };
        };

        const handleCreate = async () => {
            const createDetails = buildCreateDetails();
            if (!createDetails) {
                return;
            }

            setIsCreating(true);
            setCreateError("");

            try {
                const result = await createQcWorkOrderAndGetTasks(createDetails);
                setCreatedWorkOrderId(result.workOrder?.id || "");
                setCreatedTasks(result.tasks.items ?? []);
                onCreate?.();
            } catch (error) {
                console.error("Failed to create QC work order", error);
                setCreateError("Unable to create work order. Please try again.");
            } finally {
                setIsCreating(false);
            }
        };

        const handleDone = async () => {
            const vendorName = vendor.trim();

            if (!vendorName) {
                setFieldErrors((current) => ({
                    ...current,
                    vendor: "Vendor is mandatory."
                }));
                setCreateError("");
                return;
            }

            if (!portalVendorName) {
                setCreateError("Unable to determine the LVV Portal vendor name.");
                return;
            }

            const taskPresentations = createdTasks.map((task, index) =>
                getCreateTaskPresentation(task, index)
            );
            const passedTasks = taskPresentations.filter(
                ({ task, taskId }) => task.id && passedTaskIds[taskId]
            );
            const taskPhotos = taskPresentations
                .map(({ task, taskId, title }) => ({
                    task,
                    title,
                    photos: photosByTaskId[taskId] ?? []
                }))
                .filter(({ task, photos }) => task.id && photos.length > 0);
            const taskNotes = taskPresentations
                .map(({ task, taskId }) => ({
                    task,
                    noteText: notesByTaskId[taskId]?.trim() ?? ""
                }))
                .filter(({ task, noteText }) => task.id && noteText);

            const timeCreated = new Date().toISOString();
            const timeEvaluated = timeCreated;

            setIsFinalizing(true);
            setCreateError("");

            try {
                for (const { task, title, photos } of taskPhotos) {
                    for (const photo of photos) {
                        await createQcTaskAttachment(
                            task.id,
                            createAttachmentDetails(portalVendorName, title, photo, timeCreated)
                        );
                    }
                }

                for (const { task } of passedTasks) {
                    await evaluateQcTask(
                        task.id,
                        createPassedTaskEvaluation(portalVendorName, timeEvaluated)
                    );
                }

                for (const { task, noteText } of taskNotes) {
                    await createQcTaskComment(
                        task.id,
                        createTaskCommentDetails(portalVendorName, noteText, timeCreated)
                    );
                }

                onCreate?.();
                onClose();
            } catch (error) {
                console.error("Failed to save selected QC tasks", error);
                setCreateError(`Unable to save selected tasks. ${await getUnknownErrorMessage(error)}`);
            } finally {
                setIsFinalizing(false);
            }
        };

        const handlePrimaryAction = () =>
            hasCreatedWorkOrder ? handleDone() : handleCreate();

        const togglePassedTask = (taskId: string) => {
            setPassedTaskIds((current) => {
                const next = { ...current };

                if (next[taskId]) {
                    delete next[taskId];
                } else {
                    next[taskId] = true;
                }

                return next;
            });
        };

        const toggleTaskNoteEditor = (taskId: string) => {
            setOpenNoteTaskIds((current) => ({
                ...current,
                [taskId]: !current[taskId]
            }));
        };

        const updateTaskNote = (taskId: string, value: string) => {
            setNotesByTaskId((current) => ({
                ...current,
                [taskId]: value
            }));
        };

        const addTaskPhotos = async (taskId: string, event: Event) => {
            const input = event.currentTarget as HTMLInputElement;
            const selectedFiles = Array.from(input.files || []);
            const files = selectedFiles.filter(isImageFile);

            input.value = "";

            if (selectedFiles.length > 0 && files.length !== selectedFiles.length) {
                setCreateError(IMAGE_ATTACHMENTS_ONLY_ERROR);
            }

            if (files.length === 0) {
                return;
            }

            try {
                const uploads = await Promise.all(files.map(readImageFile));
                setPhotosByTaskId((current) => ({
                    ...current,
                    [taskId]: [...(current[taskId] ?? []), ...uploads],
                }));
                if (files.length === selectedFiles.length) {
                    setCreateError("");
                }
            } catch (error) {
                console.error("Failed to read QC task photos", error);
                setCreateError("Failed to attach one or more photos.");
            }
        };

        const removeTaskPhoto = (taskId: string, photoId: string) => {
            setPhotosByTaskId((current) => ({
                ...current,
                [taskId]: (current[taskId] ?? []).filter((photo) => photo.id !== photoId),
            }));
        };

        return (
            <oj-drawer-popup
                edge="end"
                modality="modal"
                auto-dismiss="none"
                opened={opened}
                onopenedChanged={(e: any) => {
                    if (!e.detail.value) {
                        onClose();
                    }
                }}
                class="wo-create-drawer"
            >
                <div className="wo-create-drawer-shell">
                    <div className="wo-create-drawer-header">
                        <h5>Create Work Order</h5>
                        <oj-c-button
                            chroming="borderless"
                            display="icons"
                            label="Close"
                            onojAction={onClose}
                        >
                            <span slot="startIcon" className="oj-ux-ico-close" />
                        </oj-c-button>
                    </div>

                    <div className="wo-create-drawer-body">
                        <div className="wo-create-qc-title">
                            1. Enter a display name, select the site, the vendor responsible
                            for the work, and the racks for this QC check.
                        </div>

                        <oj-form-layout label-edge="inside" max-columns="2" direction="row">
                            <div className="field">
                                <oj-c-input-text
                                    label-hint="WO Title"
                                    value={displayName}
                                    disabled={isWorkOrderFormLocked}
                                    onvalueChanged={(event: any) => {
                                        setDisplayName(event.detail.value || "");
                                        setDisplayNameEdited(true);
                                        clearFieldError("displayName");
                                    }}
                                >
                                </oj-c-input-text>
                                {fieldErrors.displayName && (
                                    <div className="wo-create-field-note" role="alert">
                                        {fieldErrors.displayName}
                                    </div>
                                )}
                            </div>

                            <div className="field">
                                <oj-c-select-single
                                    id="selectedRoom"
                                    data={roomInfo}
                                    itemText="label"
                                    labelHint="Room Name"
                                    value={selectedRoom}
                                    disabled={isWorkOrderFormLocked}
                                    onvalueChanged={(event: any) => {
                                        setSelectedRoom(event.detail.value || "");
                                        clearFieldError("siteName");
                                    }}
                                />
                                {fieldErrors.siteName && (
                                    <div className="wo-create-field-note" role="alert">
                                        {fieldErrors.siteName}
                                    </div>
                                )}
                            </div>

                            <div className="field">
                                <oj-c-input-text
                                    label-hint="Vendor"
                                    class="field-vendor"
                                    value={vendor}
                                    disabled={isWorkOrderFormLocked}
                                    onvalueChanged={(event: any) => {
                                        setVendor(event.detail.value || "");
                                        clearFieldError("vendor");
                                    }}
                                >
                                </oj-c-input-text>
                                {fieldErrors.vendor && (
                                    <div className="wo-create-field-note" role="alert">
                                        {fieldErrors.vendor}
                                    </div>
                                )}
                            </div>

                            <div className="field">
                                <oj-c-select-single
                                    id="racksSelect"
                                    data={rackInfo}
                                    itemText="label"
                                    labelHint="Racks"
                                    placeholder={
                                        selectedRoom
                                            ? isLoadingRacks ? "Loading racks..." : "Select rack"
                                            : "Select site first"
                                    }
                                    value={selectedRack || null}
                                    disabled={isWorkOrderFormLocked || !selectedRoom || isLoadingRacks || rackOptions.length === 0}
                                    onvalueChanged={(event: any) => {
                                        setSelectedRack(event.detail.value || "");
                                        clearFieldError("racks");
                                    }}
                                />
                                {isLoadingRacks && (
                                    <div className="wo-create-field-loading" role="status" aria-live="polite">
                                        <oj-c-progress-circle size="sm" value={-1}></oj-c-progress-circle>
                                        <span>Loading racks...</span>
                                    </div>
                                )}
                                {(fieldErrors.racks || rackLoadError) && (
                                    <div className="wo-create-field-note" role="alert">
                                        {fieldErrors.racks || rackLoadError}
                                    </div>
                                )}
                            </div>
                        </oj-form-layout>

                        <div className="wo-create-qc-section">
                            <div className="wo-create-qc-title">
                                2. Check the items that passed QC. Unchecked items remain
                                assigned to the vendor for follow-up. Attach any related photos.
                            </div>

                            {createError && (
                                <div className="wo-create-error" role="alert">
                                    {createError}
                                </div>
                            )}

                            {!hasCreatedWorkOrder && !createError && (
                                <div className="wo-create-task-empty">
                                    Tasks will appear after the work order is created.
                                </div>
                            )}

                            {hasCreatedWorkOrder && createdTasks.length === 0 && (
                                <div className="wo-create-task-empty">
                                    No tasks were returned for this work order.
                                </div>
                            )}

                            {createdTasks.length > 0 && (
                                <>
                                    <div className="wo-create-task-sections">
                                        {groupedCreatedTaskSections.map((section) => (
                                            <section className="wo-create-task-section" key={section.key}>
                                                <h3>{section.title}</h3>

                                                {section.tasks.length === 0 ? (
                                                    <div className="wo-create-task-section-empty">No items</div>
                                                ) : (
                                                    <div className="wo-create-task-table" role="table">
                                                        <div className="wo-create-task-row wo-create-task-header" role="row">
                                                            <div role="columnheader">Item</div>
                                                            <div role="columnheader">Photos</div>
                                                            <div role="columnheader">Notes</div>
                                                        </div>

                                                        {section.tasks.map(({ taskId, title }) => {
                                                            const photos = photosByTaskId[taskId] ?? [];
                                                            const taskNote = notesByTaskId[taskId] ?? "";
                                                            const isNoteOpen = Boolean(openNoteTaskIds[taskId]);

                                                            return (
                                                                <div className="wo-create-task-row" role="row" key={taskId}>
                                                                    <div className="wo-create-task-item" role="cell">
                                                                        <label className="wo-create-task-check">
                                                                            <input
                                                                                type="checkbox"
                                                                                aria-label={`Mark ${title} as passed QC`}
                                                                                checked={Boolean(passedTaskIds[taskId])}
                                                                                onChange={() => togglePassedTask(taskId)}
                                                                            />
                                                                            <span>{title}</span>
                                                                        </label>
                                                                    </div>

                                                                    <div className="wo-create-task-photos" role="cell">
                                                                        <div className="wo-workflow-attachments">
                                                                            {photos.map((photo) => (
                                                                                <span className="wo-workflow-photo-thumb" key={photo.id}>
                                                                                    <img src={photo.src} alt={photo.name} />
                                                                                    <button
                                                                                        type="button"
                                                                                        className="wo-workflow-photo-remove"
                                                                                        aria-label={`Remove ${photo.name}`}
                                                                                        onClick={() => removeTaskPhoto(taskId, photo.id)}
                                                                                    >
                                                                                        x
                                                                                    </button>
                                                                                </span>
                                                                            ))}
                                                                            <label
                                                                                className="wo-workflow-camera-button"
                                                                                aria-label={`Attach photos to ${title}`}
                                                                                title={`Attach photos to ${title}`}
                                                                            >
                                                                                <span className="wo-workflow-camera-icon" aria-hidden="true" />
                                                                                <input
                                                                                    className="wo-workflow-file-input"
                                                                                    type="file"
                                                                                    accept="image/*"
                                                                                    multiple
                                                                                    onChange={(event) => addTaskPhotos(taskId, event)}
                                                                                />
                                                                            </label>
                                                                        </div>
                                                                    </div>

                                                                    <div className="wo-create-task-notes" role="cell">
                                                                        <button
                                                                            type="button"
                                                                            className={`wo-create-task-note-button${isNoteOpen ? " is-open" : ""}${taskNote.trim() ? " has-note" : ""}`}
                                                                            aria-label={
                                                                                taskNote.trim()
                                                                                    ? `${isNoteOpen ? "Hide" : "Edit"} note for ${title}`
                                                                                    : `Add note for ${title}`
                                                                            }
                                                                            aria-expanded={isNoteOpen}
                                                                            aria-controls={`task-note-${taskId}`}
                                                                            title={
                                                                                taskNote.trim()
                                                                                    ? `${isNoteOpen ? "Hide" : "Edit"} note`
                                                                                    : "Add note"
                                                                            }
                                                                            disabled={isFinalizing}
                                                                            onClick={() => toggleTaskNoteEditor(taskId)}
                                                                        >
                                                                            <span className="wo-create-task-note-icon" aria-hidden="true" />
                                                                        </button>
                                                                        {taskNote.trim() && !isNoteOpen && (
                                                                            <span className="wo-create-task-note-summary">
                                                                                Note added
                                                                            </span>
                                                                        )}
                                                                        {isNoteOpen && (
                                                                            <button
                                                                                type="button"
                                                                                className="wo-create-task-note-done"
                                                                                disabled={isFinalizing}
                                                                                onClick={() => toggleTaskNoteEditor(taskId)}
                                                                            >
                                                                                Done
                                                                            </button>
                                                                        )}
                                                                        {isNoteOpen && (
                                                                            <textarea
                                                                                id={`task-note-${taskId}`}
                                                                                className="wo-create-task-note-editor"
                                                                                value={taskNote}
                                                                                disabled={isFinalizing}
                                                                                placeholder="Add a note"
                                                                                onInput={(event) =>
                                                                                    updateTaskNote(
                                                                                        taskId,
                                                                                        (event.currentTarget as HTMLTextAreaElement).value
                                                                                    )
                                                                                }
                                                                            />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </section>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="wo-create-drawer-footer">
                        <oj-c-button
                            onojAction={onClose}
                            label="Cancel"
                            disabled={isCreating || isFinalizing}
                        />
                        <oj-c-button
                            chroming="callToAction"
                            onojAction={handlePrimaryAction}
                            label={
                                hasCreatedWorkOrder
                                    ? isFinalizing ? "Saving..." : "Done"
                                    : isCreating ? "Creating..." : "Create"
                            }
                            disabled={isCreating || isFinalizing || isLoadingRacks}
                        />
                    </div>
                </div>
            </oj-drawer-popup>
        );
    };
