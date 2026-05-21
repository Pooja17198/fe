import * as base from "./lib/base-api";
export interface BuildArtifactCollection {
    "room_name": string;
    "items": Array<FileMetadata>;
}
export interface EmitUiMetricRequest {
    "actionName": string;
    "dimensions": {
        [key: string]: string;
    };
}
export interface CreateQcTaskAttachmentDetails {
    "fileName": string;
    "contentType": string;
    "contentSize": number;
    "createdBy": string;
    "emailAddress"?: string;
    "timeCreated": string;
    "content": string;
    "notes"?: string;
}
export interface CreateQcTaskCommentDetails {
    "comment": string;
    "createdBy": string;
    "emailAddress"?: string;
    "timeCreated": string;
}
export interface CreateQcWorkOrderDetails {
    "workOrderDefinitionId": string;
    "displayName": string;
    "regionId": string;
    "buildingId": string;
    "roomId": string;
    "rackLocationId": string;
    "vendorName"?: string;
    "createdBy": string;
}
export interface EvaluateQcTaskDetails {
    "result": QcTaskEvaluationResult;
    "evaluatedBy": string;
    "timeEvaluated": string;
}
export interface FileMetadata {
    "name": string;
    "sizeBytes": number;
    "createdAt": string;
}
export interface MaterialCatalog {
    "partName"?: string;
    "partDescription"?: string;
    "oracleMarketingPartNumber"?: string;
    "oracleManufacturingPartNumber"?: string;
    "vendorPartNumber"?: string;
    "partBundleSize"?: string;
    "length"?: string;
    "lengthUnit"?: string;
}
export interface MaterialCollection {
    "roomName"?: string;
    "type"?: string;
    "items": Array<MaterialSummary>;
}
export interface MaterialSummary {
    "id"?: string;
    "compartmentId"?: string;
    "bomId"?: number;
    "catalog"?: MaterialCatalog;
    "count"?: number;
    "orderCategory"?: MaterialSummaryOrderCategoryEnum;
    "reconciliationAvenue"?: MaterialSummaryReconciliationAvenueEnum;
    "createdBy"?: string;
    "updatedBy"?: string;
    "timeCreated"?: string;
    "timeUpdated"?: string;
}
export type MaterialSummaryOrderCategoryEnum = "ACTUAL" | "SPARE";
export type MaterialSummaryReconciliationAvenueEnum = "FORECASTING_FABRIC" | "WAREHOUSE_INVENTORY" | "DCO_APPROVED" | "FALLBACK";
export interface ModelError {
    "code": string;
    "message": string;
}
export interface Namespace {
    "id"?: string;
    "name"?: string;
    "compartmentId"?: string;
    "status"?: string;
}
export interface NamespaceCollection {
    "items": Array<Namespace>;
}
export interface NamespaceCreateRequest {
    "name": string;
    "compartmentId"?: string;
    "status"?: string;
}
export interface NamespaceMapping {
    "id"?: string;
    "namespaceId"?: string;
    "realmName"?: string;
    "regionName"?: string;
    "buildingName"?: string;
    "roomName"?: string;
}
export interface NamespaceMappingCollection {
    "items": Array<NamespaceMapping>;
}
export interface NamespaceMappingCreateRequest {
    "namespaceId": string;
    "realmName": string;
    "regionName": string;
    "buildingName": string;
    "roomName": string;
}
export interface NamespaceMappingPatchRequest {
    "namespaceId"?: string;
    "realmName"?: string;
    "regionName"?: string;
    "buildingName"?: string;
    "roomName"?: string;
}
export interface NamespacePatchRequest {
    "name"?: string;
    "compartmentId"?: string;
    "status"?: string;
}
export interface ParResponseObject {
    "par"?: string;
}
export interface PatchPanelPortSummary {
    "portName"?: string;
    "hasError"?: boolean;
    "easyMark"?: Array<string>;
    "errors"?: Array<PortErrorSummary>;
}
export interface PhysicalConnectionCollection {
    "roomName"?: string;
    "type"?: string;
    "items": Array<PhysicalConnectionSummary>;
    "materials"?: Array<MaterialSummary>;
}
export interface PhysicalConnectionImageResponse {
    "image": string;
    "materials"?: Array<MaterialSummary>;
}
export interface PhysicalConnectionSummary {
    "id"?: string;
    "compartmentId"?: string;
    "bomId"?: number;
    "sourceRackNumber"?: string;
    "destinationRackNumber"?: string;
    "cableTypeId"?: number;
    "cableType"?: string;
    "routeType"?: PhysicalConnectionSummaryRouteTypeEnum;
    "pathType"?: string;
    "connectionCount"?: number;
    "logicalConnectionId"?: number;
    "path": Array<Polyline>;
    "image"?: string;
    "createdBy"?: string;
    "updatedBy"?: string;
    "timeCreated"?: string;
    "timeUpdated"?: string;
}
export type PhysicalConnectionSummaryRouteTypeEnum = "A" | "SINGLE";
export interface PhysicalCutsheetCollection {
    "items": Array<PhysicalCutsheetSummary>;
}
export interface PhysicalCutsheetRackNumberCollection {
    "items": Array<string>;
}
export interface PhysicalCutsheetSummary {
    "deviceName"?: string;
    "devicePort"?: string;
    "buildingName"?: string;
    "roomName"?: string;
    "rackNumber"?: string;
    "rackRole"?: string;
    "easyMark"?: Array<string>;
    "additionalAttributes"?: any;
}
export interface Polyline {
    "pointX": number;
    "pointY": number;
}
export interface PortErrorSummary {
    "lldpErrors"?: Array<string>;
    "opticErrors"?: Array<string>;
    "interfaceErrors"?: Array<string>;
    "otherErrors"?: Array<string>;
    "lastValidated"?: string;
}
export interface QcTaskAttachmentCollection {
    "items": Array<QcTaskAttachmentSummary>;
}
export interface QcTaskAttachmentSummary {
    "attachmentId": string;
    "taskId": string;
    "createdBy"?: string;
    "fileName": string;
    "contentType": string;
    "contentSize"?: number;
    "content"?: string;
    "timeCreated": string;
}
export interface QcTaskCollection {
    "items": Array<QcTaskSummary>;
}
export interface QcTaskCommentCollection {
    "items": Array<QcTaskCommentSummary>;
}
export interface QcTaskCommentSummary {
    "commentId": string;
    "taskId": string;
    "createdBy"?: string;
    "comment": string;
    "timeCreated": string;
}
export type QcTaskEvaluationResult = "PASS";
export declare enum QcTaskEvaluationResultValues {
    PASS = "PASS"
}
export type QcTaskLifecycleState = "IN_PROGRESS" | "COMPLETED" | "FAILED";
export declare enum QcTaskLifecycleStateValues {
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
}
export interface QcTaskSummary {
    "id": string;
    "workOrderId": string;
    "taskKey"?: string;
    "vendorName"?: string;
    "lifecycleState"?: QcTaskLifecycleState;
    "timeCreated"?: string;
    "timeUpdated"?: string;
    "timeStarted"?: string;
    "timeCompleted"?: string;
}
export interface QcWorkOrder {
    "id": string;
    "workOrderDefinitionId"?: string;
    "displayName"?: string;
    "timeCreated": string;
    "timeUpdated"?: string;
    "regionId"?: string;
    "buildingId"?: string;
    "roomId"?: string;
    "rackLocationId"?: string;
    "vendorName"?: string;
    "createdBy"?: string;
    "lifecycleState": QcWorkOrderLifecycleState;
}
export interface QcWorkOrderCollection {
    "items": Array<QcWorkOrderSummary>;
}
export type QcWorkOrderLifecycleState = "IN_PROGRESS" | "FAILED" | "SUCCEEDED";
export declare enum QcWorkOrderLifecycleStateValues {
    IN_PROGRESS = "IN_PROGRESS",
    FAILED = "FAILED",
    SUCCEEDED = "SUCCEEDED"
}
export interface QcWorkOrderSummary {
    "id": string;
    "workOrderDefinitionId"?: string;
    "displayName"?: string;
    "timeCreated": string;
    "timeUpdated"?: string;
    "regionId"?: string;
    "buildingId"?: string;
    "roomId"?: string;
    "rackLocationId"?: string;
    "vendorName"?: string;
    "createdBy"?: string;
    "lifecycleState": QcWorkOrderLifecycleState;
}
export interface RackDeviceSummary {
    "deviceName"?: string;
    "elevation"?: number;
    "patchPanel"?: Array<Array<PatchPanelPortSummary>>;
}
export interface RackViewResponse {
    "rackDevices"?: Array<RackDeviceSummary>;
}
export interface RoomLayout {
    "roomCanonicalName"?: string;
    "layout"?: any;
}
export interface RoomMetadata {
    "regionDisplayName"?: string;
    "availabilityDomainCanonicalShortCode"?: string;
    "buildingCanonicalName"?: string;
    "roomCanonicalName"?: string;
}
export interface RoomMetadataCollection {
    "items"?: Array<RoomMetadata>;
}
export interface RoomPlatform {
    "rackNumber"?: string;
    "platformName"?: string;
    "blockName"?: string;
}
export interface Version {
    "version"?: string;
}
export interface BuildArtifactsApiDownloadBuildArtifactArgs {
    "roomName": string;
    "filePath": string;
}
export type BuildArtifactsApiDownloadBuildArtifactReturnType = {
    response: Response;
    data: ParResponseObject;
};
export interface BuildArtifactsApiListBuildArtifactsArgs {
    "roomName": string;
}
export type BuildArtifactsApiListBuildArtifactsReturnType = {
    response: Response;
    data: BuildArtifactCollection;
};
export declare class BuildArtifactsApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): BuildArtifactsApi;
    downloadBuildArtifact(params: {
        "roomName": string;
        "filePath": string;
    }, options?: any): Promise<{
        response: Response;
        data: ParResponseObject;
    }>;
    listBuildArtifacts(params: {
        "roomName": string;
    }, options?: any): Promise<{
        response: Response;
        data: BuildArtifactCollection;
    }>;
}
export interface MaterialApiListMaterialsArgs {
    "roomName"?: string;
    "bomId"?: number;
    "limit"?: number;
    "page"?: string;
    "sortOrder"?: string;
    "sortBy"?: string;
    "opcRequestId"?: string;
}
export type MaterialApiListMaterialsReturnType = {
    response: Response;
    data: MaterialCollection;
};
export declare class MaterialApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): MaterialApi;
    listMaterials(params: {
        "roomName"?: string;
        "bomId"?: number;
        "limit"?: number;
        "page"?: string;
        "sortOrder"?: string;
        "sortBy"?: string;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: MaterialCollection;
    }>;
}
export interface NamespaceApiCreateNamespaceArgs {
    "namespaceCreateRequest": NamespaceCreateRequest;
}
export type NamespaceApiCreateNamespaceReturnType = {
    response: Response;
    data: Namespace;
};
export interface NamespaceApiDeleteNamespaceArgs {
    "id": string;
}
export type NamespaceApiDeleteNamespaceReturnType = {
    response: Response;
    data: Namespace;
};
export interface NamespaceApiUpdateNamespaceArgs {
    "id": string;
    "namespacePatchRequest": NamespacePatchRequest;
}
export type NamespaceApiUpdateNamespaceReturnType = {
    response: Response;
    data: Namespace;
};
export declare class NamespaceApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): NamespaceApi;
    createNamespace(params: {
        "namespaceCreateRequest": NamespaceCreateRequest;
    }, options?: any): Promise<{
        response: Response;
        data: Namespace;
    }>;
    deleteNamespace(params: {
        "id": string;
    }, options?: any): Promise<{
        response: Response;
        data: Namespace;
    }>;
    listNamespaces(options?: any): Promise<{
        response: Response;
        data: NamespaceCollection;
    }>;
    updateNamespace(params: {
        "id": string;
        "namespacePatchRequest": NamespacePatchRequest;
    }, options?: any): Promise<{
        response: Response;
        data: Namespace;
    }>;
}
export interface NamespaceMappingApiCreateNamespaceMappingArgs {
    "namespaceCreateRequest": NamespaceMappingCreateRequest;
}
export type NamespaceMappingApiCreateNamespaceMappingReturnType = {
    response: Response;
    data: NamespaceMapping;
};
export interface NamespaceMappingApiDeleteNamespaceMappingArgs {
    "id": string;
}
export type NamespaceMappingApiDeleteNamespaceMappingReturnType = {
    response: Response;
    data: NamespaceMapping;
};
export interface NamespaceMappingApiUpdateNamespaceMappingArgs {
    "id": string;
    "namespacePatchRequest": NamespaceMappingPatchRequest;
}
export type NamespaceMappingApiUpdateNamespaceMappingReturnType = {
    response: Response;
    data: NamespaceMapping;
};
export declare class NamespaceMappingApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): NamespaceMappingApi;
    createNamespaceMapping(params: {
        "namespaceCreateRequest": NamespaceMappingCreateRequest;
    }, options?: any): Promise<{
        response: Response;
        data: NamespaceMapping;
    }>;
    deleteNamespaceMapping(params: {
        "id": string;
    }, options?: any): Promise<{
        response: Response;
        data: NamespaceMapping;
    }>;
    listNamespaceMappings(options?: any): Promise<{
        response: Response;
        data: NamespaceMappingCollection;
    }>;
    updateNamespaceMapping(params: {
        "id": string;
        "namespacePatchRequest": NamespaceMappingPatchRequest;
    }, options?: any): Promise<{
        response: Response;
        data: NamespaceMapping;
    }>;
}
export interface PhysicalConnectionApiGetPhysicalConnectionImageArgs {
    "sourceRackNumber": string;
    "destinationRackNumber": string;
    "roomName"?: string;
    "opcRequestId"?: string;
}
export type PhysicalConnectionApiGetPhysicalConnectionImageReturnType = {
    response: Response;
    data: PhysicalConnectionImageResponse;
};
export interface PhysicalConnectionApiListPhysicalConnectionsArgs {
    "roomName"?: string;
    "blockName"?: string;
    "bomId"?: number;
    "limit"?: number;
    "page"?: string;
    "sortOrder"?: string;
    "sortBy"?: string;
    "opcRequestId"?: string;
}
export type PhysicalConnectionApiListPhysicalConnectionsReturnType = {
    response: Response;
    data: PhysicalConnectionCollection;
};
export declare class PhysicalConnectionApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): PhysicalConnectionApi;
    getPhysicalConnectionImage(params: {
        "sourceRackNumber": string;
        "destinationRackNumber": string;
        "roomName"?: string;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: PhysicalConnectionImageResponse;
    }>;
    listPhysicalConnections(params: {
        "roomName"?: string;
        "blockName"?: string;
        "bomId"?: number;
        "limit"?: number;
        "page"?: string;
        "sortOrder"?: string;
        "sortBy"?: string;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: PhysicalConnectionCollection;
    }>;
}
export interface PhysicalCutsheetApiListPhysicalCutsheetRackNumbersArgs {
    "roomName": string;
    "rackRole"?: string;
    "rackType"?: string;
}
export type PhysicalCutsheetApiListPhysicalCutsheetRackNumbersReturnType = {
    response: Response;
    data: PhysicalCutsheetRackNumberCollection;
};
export interface PhysicalCutsheetApiListPhysicalCutsheetsArgs {
    "buildingName"?: string;
    "roomName"?: string;
    "rackNumber"?: string;
    "rackRole"?: string;
    "deviceName"?: string;
    "devicePort"?: string;
    "limit"?: number;
    "page"?: string;
    "sortOrder"?: string;
    "sortBy"?: string;
}
export type PhysicalCutsheetApiListPhysicalCutsheetsReturnType = {
    response: Response;
    data: PhysicalCutsheetCollection;
};
export declare class PhysicalCutsheetApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): PhysicalCutsheetApi;
    listPhysicalCutsheetRackNumbers(params: {
        "roomName": string;
        "rackRole"?: string;
        "rackType"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: PhysicalCutsheetRackNumberCollection;
    }>;
    listPhysicalCutsheets(params: {
        "buildingName"?: string;
        "roomName"?: string;
        "rackNumber"?: string;
        "rackRole"?: string;
        "deviceName"?: string;
        "devicePort"?: string;
        "limit"?: number;
        "page"?: string;
        "sortOrder"?: string;
        "sortBy"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: PhysicalCutsheetCollection;
    }>;
}
export interface QcApiCreateQcTaskAttachmentArgs {
    "taskId": string;
    "createQcTaskAttachmentDetails": CreateQcTaskAttachmentDetails;
    "opcRequestId"?: string;
}
export type QcApiCreateQcTaskAttachmentReturnType = {
    response: Response;
    data: QcTaskAttachmentSummary;
};
export interface QcApiCreateQcTaskCommentArgs {
    "taskId": string;
    "createQcTaskCommentDetails": CreateQcTaskCommentDetails;
    "opcRequestId"?: string;
}
export type QcApiCreateQcTaskCommentReturnType = {
    response: Response;
    data: QcTaskCommentSummary;
};
export interface QcApiCreateQcWorkOrderArgs {
    "createQcWorkOrderDetails": CreateQcWorkOrderDetails;
    "opcRequestId"?: string;
}
export type QcApiCreateQcWorkOrderReturnType = {
    response: Response;
    data: QcWorkOrder;
};
export interface QcApiEvaluateQcTaskArgs {
    "taskId": string;
    "evaluateQcTaskDetails": EvaluateQcTaskDetails;
    "opcRequestId"?: string;
}
export type QcApiEvaluateQcTaskReturnType = {
    response: Response;
    data: QcTaskSummary;
};
export interface QcApiGetQcWorkOrderArgs {
    "workOrderId": string;
    "opcRequestId"?: string;
}
export type QcApiGetQcWorkOrderReturnType = {
    response: Response;
    data: QcWorkOrder;
};
export interface QcApiListQcTaskAttachmentsArgs {
    "taskId": string;
    "limit"?: number;
    "page"?: string;
    "sortOrder"?: string;
    "sortBy"?: string;
    "opcRequestId"?: string;
}
export type QcApiListQcTaskAttachmentsReturnType = {
    response: Response;
    data: QcTaskAttachmentCollection;
};
export interface QcApiListQcTaskCommentsArgs {
    "taskId": string;
    "limit"?: number;
    "page"?: string;
    "sortOrder"?: string;
    "sortBy"?: string;
    "opcRequestId"?: string;
}
export type QcApiListQcTaskCommentsReturnType = {
    response: Response;
    data: QcTaskCommentCollection;
};
export interface QcApiListQcWorkOrderTasksArgs {
    "workOrderId": string;
    "limit"?: number;
    "page"?: string;
    "sortOrder"?: string;
    "sortBy"?: string;
    "opcRequestId"?: string;
}
export type QcApiListQcWorkOrderTasksReturnType = {
    response: Response;
    data: QcTaskCollection;
};
export interface QcApiListQcWorkOrdersArgs {
    "lifecycleState"?: string;
    "createdBy"?: string;
    "regionId"?: string;
    "buildingId"?: string;
    "roomId"?: string;
    "rackLocationId"?: string;
    "limit"?: number;
    "page"?: string;
    "sortOrder"?: string;
    "sortBy"?: string;
    "opcRequestId"?: string;
}
export type QcApiListQcWorkOrdersReturnType = {
    response: Response;
    data: QcWorkOrderCollection;
};
export declare class QcApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): QcApi;
    createQcTaskAttachment(params: {
        "taskId": string;
        "createQcTaskAttachmentDetails": CreateQcTaskAttachmentDetails;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: QcTaskAttachmentSummary;
    }>;
    createQcTaskComment(params: {
        "taskId": string;
        "createQcTaskCommentDetails": CreateQcTaskCommentDetails;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: QcTaskCommentSummary;
    }>;
    createQcWorkOrder(params: {
        "createQcWorkOrderDetails": CreateQcWorkOrderDetails;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: QcWorkOrder;
    }>;
    evaluateQcTask(params: {
        "taskId": string;
        "evaluateQcTaskDetails": EvaluateQcTaskDetails;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: QcTaskSummary;
    }>;
    getQcWorkOrder(params: {
        "workOrderId": string;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: QcWorkOrder;
    }>;
    listQcTaskAttachments(params: {
        "taskId": string;
        "limit"?: number;
        "page"?: string;
        "sortOrder"?: string;
        "sortBy"?: string;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: QcTaskAttachmentCollection;
    }>;
    listQcTaskComments(params: {
        "taskId": string;
        "limit"?: number;
        "page"?: string;
        "sortOrder"?: string;
        "sortBy"?: string;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: QcTaskCommentCollection;
    }>;
    listQcWorkOrderTasks(params: {
        "workOrderId": string;
        "limit"?: number;
        "page"?: string;
        "sortOrder"?: string;
        "sortBy"?: string;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: QcTaskCollection;
    }>;
    listQcWorkOrders(params: {
        "lifecycleState"?: string;
        "createdBy"?: string;
        "regionId"?: string;
        "buildingId"?: string;
        "roomId"?: string;
        "rackLocationId"?: string;
        "limit"?: number;
        "page"?: string;
        "sortOrder"?: string;
        "sortBy"?: string;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: QcWorkOrderCollection;
    }>;
}
export interface RackViewApiGetRackViewArgs {
    "roomName"?: string;
    "rackNumber"?: string;
}
export type RackViewApiGetRackViewReturnType = {
    response: Response;
    data: RackViewResponse;
};
export declare class RackViewApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): RackViewApi;
    getRackView(params: {
        "roomName"?: string;
        "rackNumber"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: RackViewResponse;
    }>;
}
export declare class RoomMetadataApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): RoomMetadataApi;
    getRoomMetadata(options?: any): Promise<{
        response: Response;
        data: RoomMetadataCollection;
    }>;
}
export interface RoomMetadataByRoomApiGetPlatformListByRoomArgs {
    "roomName": string;
}
export type RoomMetadataByRoomApiGetPlatformListByRoomReturnType = {
    response: Response;
    data: Array<RoomPlatform>;
};
export declare class RoomMetadataByRoomApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): RoomMetadataByRoomApi;
    getPlatformListByRoom(params: {
        "roomName": string;
    }, options?: any): Promise<{
        response: Response;
        data: Array<RoomPlatform>;
    }>;
}
export interface RoomMetadataLayoutApiGetRoomMetadataLayoutArgs {
    "roomName": string;
}
export type RoomMetadataLayoutApiGetRoomMetadataLayoutReturnType = {
    response: Response;
    data: RoomLayout;
};
export declare class RoomMetadataLayoutApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): RoomMetadataLayoutApi;
    getRoomMetadataLayout(params: {
        "roomName": string;
    }, options?: any): Promise<{
        response: Response;
        data: RoomLayout;
    }>;
}
export interface UiMetricsApiEmitUiMetricArgs {
    "emitUiMetricRequest": EmitUiMetricRequest;
    "opcRequestId"?: string;
}
export type UiMetricsApiEmitUiMetricReturnType = Response;
export declare class UiMetricsApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): UiMetricsApi;
    emitUiMetric(params: {
        "emitUiMetricRequest": EmitUiMetricRequest;
        "opcRequestId"?: string;
    }, options?: any): Promise<Response>;
}
export declare class VersionApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): VersionApi;
    getVersion(options?: any): Promise<{
        response: Response;
        data: Version;
    }>;
}
