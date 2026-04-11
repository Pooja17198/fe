import * as base from "./lib/base-api";
export interface BuildArtifactCollection {
    "room_name": string;
    "items": Array<FileMetadata>;
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
export interface PhysicalConnectionCollection {
    "roomName"?: string;
    "type"?: string;
    "items": Array<PhysicalConnectionSummary>;
}
export interface PhysicalConnectionImageResponse {
    "image": string;
    "materials"?: MaterialSummary[];
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
export interface Polyline {
    "pointX": number;
    "pointY": number;
}
export interface RoomLayout {
    "roomCanonicalName"?: string;
    "layout"?: any;
}
export interface RoomMetadata {
    "regionDisplayName": string;
    "availabilityDomainCanonicalShortCode": string;
    "buildingCanonicalName": string;
    "roomCanonicalName": string;
}
export interface RoomMetadataCollection {
    "items"?: Array<RoomMetadata>;
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
    "roomName": string;
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
        "roomName": string;
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
    "roomName": string;
    "sourceRackNumber": string;
    "destinationRackNumber": string;
    "opcRequestId"?: string;
}
export type PhysicalConnectionApiGetPhysicalConnectionImageReturnType = {
    response: Response;
    data: PhysicalConnectionImageResponse;
};
export interface PhysicalConnectionApiListPhysicalConnectionsArgs {
    "roomName": string;
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
        "roomName": string;
        "sourceRackNumber": string;
        "destinationRackNumber": string;
        "opcRequestId"?: string;
    }, options?: any): Promise<{
        response: Response;
        data: PhysicalConnectionImageResponse;
    }>;
    listPhysicalConnections(params: {
        "roomName": string;
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
export declare class RoomMetadataApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): RoomMetadataApi;
    getRoomMetadata(options?: any): Promise<{
        response: Response;
        data: RoomMetadataCollection;
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
export declare class VersionApi extends base.BaseAPI {
    static createFromEndpointTemplate(fetch: base.Fetch, region: string, secondLevelDomain: string, config?: base.BaseApiConfig): VersionApi;
    getVersion(options?: any): Promise<{
        response: Response;
        data: Version;
    }>;
}
