export interface BaseApiConfig {
    requestInterceptors?: ((request: Request, operation?: string) => PromiseLike<Request>)[];
    responseInterceptors?: ((request: Request, response: Response, operation?: string) => PromiseLike<Response>)[];
    errorHandler?: (error: any) => void;
}
export type Fetch = (input: RequestInfo, init?: RequestInit) => Promise<Response>;
type FormBody = {
    type: "form";
    mediaType?: string;
    params?: {
        [key: string]: string | File;
    };
};
type ContentBody = {
    type: "content";
    contentType?: string;
    content?: any;
};
type Body = FormBody | ContentBody;
type QueryParam = {
    collectionFormat?: string;
    values: any | any[];
};
type RequestMetadata = {
    operationName: string;
    path: string;
    httpMethod: string;
    headerParameters?: {
        [key: string]: any;
    };
    queryParameters?: {
        [key: string]: QueryParam;
    };
    body?: Body;
    options: Partial<RequestInit>;
    parseResponseBody?: boolean;
};
export declare function entries(object: any): [string, any][];
export declare function validateRequiredParameters(required: string[], operationName: string, params: {
    [key: string]: any;
}): void;
export declare function buildEndpointFromTemplate(template: string, basePath: string, region: string, secondLevelDomain: string): string;
type Resp<T> = T extends undefined ? Promise<Response> : Promise<{
    response: Response;
    data: T;
}>;
export declare class BaseAPI {
    protected fetch: Fetch;
    protected basePath: string;
    protected config: Required<BaseApiConfig>;
    constructor(fetch: Fetch, basePath: string, config?: BaseApiConfig);
    private invoke;
    protected request<T = undefined>({ operationName, path, httpMethod, headerParameters, queryParameters, body, options, parseResponseBody, }: RequestMetadata): Resp<T>;
}
export {};
