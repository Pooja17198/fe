import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import {
  CreateQcTaskAttachmentDetails,
  CreateQcTaskCommentDetails,
  CreateQcWorkOrderDetails,
  EvaluateQcTaskDetails,
  QcApiCreateQcTaskAttachmentArgs,
  QcApiCreateQcTaskCommentArgs,
  QcApiCreateQcWorkOrderArgs,
  QcApiEvaluateQcTaskArgs,
  QcApiGetQcWorkOrderArgs,
  QcApiListQcTaskAttachmentsArgs,
  QcApiListQcTaskCommentsArgs,
  QcApiListQcWorkOrderTasksArgs,
  QcApiListQcWorkOrdersArgs,
  QcTaskAttachmentCollection,
  QcTaskAttachmentSummary,
  QcTaskCollection,
  QcTaskCommentCollection,
  QcTaskCommentSummary,
  QcTaskSummary,
  QcWorkOrder,
  QcWorkOrderCollection,
} from "../../../../../../gen/clients/ide-lvv-client";
import { QcApiBasePath, QcApiClient } from "../../../cabling/api/apiClients";
import { MockListQcWorkOrdersApi } from "../mockApi/MockListQcWorkOrdersApi";
import { MockQcWorkOrdersApi } from "../mockApi/MockQcWorkOrdersApi";
import { USE_MOCK_QC_API } from "../..";

type ListQcWorkOrdersParams = QcApiListQcWorkOrdersArgs;

export type ListQcWorkOrderFilters = Pick<
  QcApiListQcWorkOrdersArgs,
  | "lifecycleState"
  | "createdBy"
  | "regionId"
  | "buildingId"
  | "roomId"
  | "rackLocationId"
>;

export type ListQcWorkOrderClientFilters = {
  id?: string;
  timeUpdated?: string;
  assignee?: string;
};

export type QcWorkOrderListQuery = {
  filters: ListQcWorkOrderFilters;
  clientFilters: ListQcWorkOrderClientFilters;
  pageSize: number;
  sortBy?: QcApiListQcWorkOrdersArgs["sortBy"];
  sortOrder?: QcApiListQcWorkOrdersArgs["sortOrder"];
};

type UseListQcWorkOrdersOptions = {
  fetchAll?: boolean;
  query?: QcWorkOrderListQuery;
};

type QcRequestState<T> = {
  data: T | undefined;
  error: any;
  isFetching: boolean;
  isPending: boolean;
  refetch: () => Promise<void>;
};

type UseQcWorkOrderTasksOptions = {
  pageSize?: number;
  fetchAll?: boolean;
};

type CreatedQcWorkOrderWithTasks = {
  workOrder?: QcWorkOrder;
  tasks: QcTaskCollection;
};

export const DEFAULT_QC_WORK_ORDER_PAGE_SIZE = 100;
const QC_ATTACHMENT_UPLOAD_TIMEOUT_MS = 45000;
const QC_ATTACHMENT_RESPONSE_BODY_TIMEOUT_MS = 3000;

export const createDefaultQcWorkOrderListQuery = (): QcWorkOrderListQuery => ({
  filters: {},
  clientFilters: {},
  pageSize: DEFAULT_QC_WORK_ORDER_PAGE_SIZE,
});

const DEFAULT_QC_WORK_ORDER_LIST_QUERY = createDefaultQcWorkOrderListQuery();

const createQcRequestId = () =>
  window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `qc-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;

const readAttachmentResponseBody = async <T,>(
  response: Response,
  fallback: T,
): Promise<T> => {
  let timeoutId: number | undefined;

  try {
    const bodyText = await Promise.race([
      response.clone().text(),
      new Promise<undefined>((resolve) => {
        timeoutId = window.setTimeout(
          () => resolve(undefined),
          QC_ATTACHMENT_RESPONSE_BODY_TIMEOUT_MS,
        );
      }),
    ]);

    if (!bodyText) {
      response.body?.cancel().catch(() => undefined);
      return fallback;
    }

    return JSON.parse(bodyText) as T;
  } catch {
    return fallback;
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
};

const createAttachmentSummaryFallback = (
  taskId: string,
  details: CreateQcTaskAttachmentDetails,
): QcTaskAttachmentSummary => ({
  attachmentId: `attachment-${Date.now()}`,
  taskId,
  createdBy: details.createdBy,
  fileName: details.fileName,
  contentType: details.contentType,
  contentSize: details.contentSize,
  timeCreated: details.timeCreated,
});

const extractTaskItems = (data: unknown): QcTaskSummary[] => {
  const responseData = data as any;

  if (Array.isArray(responseData)) {
    return responseData;
  }

  if (Array.isArray(responseData?.items)) {
    return responseData.items;
  }

  if (Array.isArray(responseData?.tasks)) {
    return responseData.tasks;
  }

  if (Array.isArray(responseData?.tasks?.items)) {
    return responseData.tasks.items;
  }

  if (Array.isArray(responseData?.workOrderTasks)) {
    return responseData.workOrderTasks;
  }

  if (Array.isArray(responseData?.workOrderTasks?.items)) {
    return responseData.workOrderTasks.items;
  }

  if (Array.isArray(responseData?.taskCollection?.items)) {
    return responseData.taskCollection.items;
  }

  return [];
};

const extractWorkOrderFromCreateResponse = (data: unknown): QcWorkOrder | undefined => {
  const responseData = data as any;

  if (responseData?.workOrder?.id) {
    return responseData.workOrder as QcWorkOrder;
  }

  if (responseData?.id) {
    return responseData as QcWorkOrder;
  }

  return undefined;
};

export const getQcTaskAssignedTo = (task: QcTaskSummary | undefined) =>
  ((task as QcTaskSummary & { assignedTo?: string } | undefined)?.assignedTo?.trim()
    || task?.vendorName?.trim()
    || "");

export const createQcWorkOrderAndGetTasks = async (
  createQcWorkOrderDetails: CreateQcWorkOrderDetails,
): Promise<CreatedQcWorkOrderWithTasks> => {
  const params: QcApiCreateQcWorkOrderArgs = { createQcWorkOrderDetails };
  const createResponse = USE_MOCK_QC_API
    ? await MockQcWorkOrdersApi.createQcWorkOrder(params)
    : await QcApiClient.createQcWorkOrder(params);
  const tasksFromCreate = extractTaskItems(createResponse.data);
  const workOrder = extractWorkOrderFromCreateResponse(createResponse.data);

  if (tasksFromCreate.length > 0) {
    return {
      workOrder,
      tasks: { items: tasksFromCreate },
    };
  }

  if (!workOrder?.id) {
    return {
      workOrder,
      tasks: { items: [] },
    };
  }

  const taskResponse = USE_MOCK_QC_API
    ? await MockQcWorkOrdersApi.listQcWorkOrderTasks({ workOrderId: workOrder.id, limit: 100 })
    : await QcApiClient.listQcWorkOrderTasks({ workOrderId: workOrder.id, limit: 100 });

  return {
    workOrder,
    tasks: taskResponse.data,
  };
};

export const createQcTaskAttachment = async (
  taskId: string,
  createQcTaskAttachmentDetails: CreateQcTaskAttachmentDetails,
): Promise<QcTaskAttachmentSummary> => {
  const params: QcApiCreateQcTaskAttachmentArgs = {
    taskId,
    createQcTaskAttachmentDetails,
  };
  if (USE_MOCK_QC_API) {
    const response = await MockQcWorkOrdersApi.createQcTaskAttachment(params);
    return response.data;
  }

  const controller = new AbortController();
  const requestId = createQcRequestId();
  const endpoint = `${QcApiBasePath}/qc/tasks/${encodeURIComponent(taskId)}/attachments`;
  const body = JSON.stringify(createQcTaskAttachmentDetails);
  const payloadSize = new Blob([body]).size;
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, QC_ATTACHMENT_UPLOAD_TIMEOUT_MS);

  try {
    const response = await window.fetch(
      endpoint,
      {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-OCI-Splat-CSRF": "1",
          "opc-request-id": requestId,
        },
        body,
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw response;
    }

    return readAttachmentResponseBody(
      response,
      createAttachmentSummaryFallback(taskId, createQcTaskAttachmentDetails),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.error("QC attachment upload timed out", {
        endpoint,
        requestId,
        taskId,
        fileName: createQcTaskAttachmentDetails.fileName,
        contentSize: formatBytes(createQcTaskAttachmentDetails.contentSize ?? 0),
        jsonPayload: formatBytes(payloadSize),
      });
      throw new Error("The image upload took too long. Please try again.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const createQcTaskComment = async (
  taskId: string,
  createQcTaskCommentDetails: CreateQcTaskCommentDetails,
): Promise<QcTaskCommentSummary> => {
  const params: QcApiCreateQcTaskCommentArgs = {
    taskId,
    createQcTaskCommentDetails,
  };
  const response = USE_MOCK_QC_API
    ? await MockQcWorkOrdersApi.createQcTaskComment(params)
    : await QcApiClient.createQcTaskComment(params);

  return response.data;
};

export const listQcTaskAttachments = async (
  taskId: string,
  params: Omit<QcApiListQcTaskAttachmentsArgs, "taskId"> = {},
): Promise<QcTaskAttachmentCollection> => {
  const requestParams: QcApiListQcTaskAttachmentsArgs = {
    taskId,
    limit: 100,
    ...params,
  };
  const response = USE_MOCK_QC_API
    ? await MockQcWorkOrdersApi.listQcTaskAttachments(requestParams)
    : await QcApiClient.listQcTaskAttachments(requestParams);

  return response.data;
};

export const listQcTaskComments = async (
  taskId: string,
  params: Omit<QcApiListQcTaskCommentsArgs, "taskId"> = {},
): Promise<QcTaskCommentCollection> => {
  const requestParams: QcApiListQcTaskCommentsArgs = {
    taskId,
    limit: 100,
    sortBy: "timeCreated",
    sortOrder: "DESC",
    ...params,
  };
  const response = USE_MOCK_QC_API
    ? await MockQcWorkOrdersApi.listQcTaskComments(requestParams)
    : await QcApiClient.listQcTaskComments(requestParams);

  return response.data;
};

export const evaluateQcTask = async (
  taskId: string,
  evaluateQcTaskDetails: EvaluateQcTaskDetails,
): Promise<QcTaskSummary> => {
  const params: QcApiEvaluateQcTaskArgs = { taskId, evaluateQcTaskDetails };
  const response = USE_MOCK_QC_API
    ? await MockQcWorkOrdersApi.evaluateQcTask(params)
    : await QcApiClient.evaluateQcTask(params);

  return response.data;
};

export const listFirstQcWorkOrderTask = async (
  workOrderId: string,
): Promise<QcTaskSummary | undefined> => {
  const params: QcApiListQcWorkOrderTasksArgs = {
    workOrderId,
    limit: 1,
    sortBy: "timeStarted",
    sortOrder: "ASC",
  };
  const response = USE_MOCK_QC_API
    ? await MockQcWorkOrdersApi.listQcWorkOrderTasks(params)
    : await QcApiClient.listQcWorkOrderTasks(params);

  return extractTaskItems(response.data)[0];
};

export const useListQcWorkOrders = (
  options: UseListQcWorkOrdersOptions = {},
) => {
  const {
    fetchAll = false,
    query = DEFAULT_QC_WORK_ORDER_LIST_QUERY,
  } = options;
  const { filters, pageSize, sortBy, sortOrder } = query;

  const [data, setData] = useState<QcWorkOrderCollection>({ items: [] });
  const [error, setError] = useState<any>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isPending, setIsPending] = useState(true);
  const [nextPage, setNextPage] = useState<string | undefined>();
  const paramsRef = useRef<ListQcWorkOrdersParams>({ limit: pageSize });
  const requestIdRef = useRef(0);
  const isFetchingRef = useRef(false);

  const fetchPage = useCallback(
    async (
      params: ListQcWorkOrdersParams = {},
    ): Promise<{ data: QcWorkOrderCollection; nextPage?: string }> => {
      if (USE_MOCK_QC_API) {
        const response = await MockListQcWorkOrdersApi.listQcWorkOrders(
          params.lifecycleState,
          params.createdBy,
          undefined,
          params.regionId,
          params.buildingId,
          undefined,
          params.roomId,
          params.rackLocationId,
          params.sortBy,
        );
        return {
          data: response.data,
        };
      }

      const response = await QcApiClient.listQcWorkOrders({
        limit: pageSize,
        ...filters,
        sortBy,
        sortOrder,
        ...params,
      });

      return {
        data: response.data,
        nextPage: response.response.headers.get("opc-next-page") ?? undefined,
      };
    },
    [filters, pageSize, sortBy, sortOrder],
  );

  const fetchFromStart = useCallback(
    async (params: ListQcWorkOrdersParams = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      paramsRef.current = {
        limit: pageSize,
        ...filters,
        sortBy,
        sortOrder,
        ...params,
      };
      setError(null);
      isFetchingRef.current = true;
      setIsPending(true);
      setIsFetching(true);

      try {
        let currentParams = paramsRef.current;
        let accumulated: QcWorkOrderCollection = { items: [] };
        let page: string | undefined;

        do {
          const result = await fetchPage(currentParams);
          accumulated = {
            items: [...accumulated.items, ...(result.data.items ?? [])],
          };
          page = result.nextPage;
          currentParams = { ...paramsRef.current, page };
        } while (fetchAll && page);

        if (requestIdRef.current === requestId) {
          setData(accumulated);
          setNextPage(fetchAll ? undefined : page);
        }
      } catch (e) {
        if (requestIdRef.current === requestId) {
          setError(e);
        }
      } finally {
        if (requestIdRef.current === requestId) {
          isFetchingRef.current = false;
          setIsFetching(false);
          setIsPending(false);
        }
      }
    },
    [fetchAll, fetchPage, filters, pageSize, sortBy, sortOrder],
  );

  const loadNextPage = useCallback(async () => {
    if (isFetchingRef.current || !nextPage) {
      return;
    }

    const requestId = requestIdRef.current;
    setError(null);
    isFetchingRef.current = true;
    setIsFetching(true);

    try {
      const result = await fetchPage({ ...paramsRef.current, page: nextPage });

      if (requestIdRef.current === requestId) {
        setData((current) => ({
          items: [...(current.items ?? []), ...(result.data.items ?? [])],
        }));
        setNextPage(result.nextPage);
      }
    } catch (e) {
      if (requestIdRef.current === requestId) {
        setError(e);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        isFetchingRef.current = false;
        setIsFetching(false);
        setIsPending(false);
      }
    }
  }, [fetchPage, nextPage]);

  useEffect(() => {
    void fetchFromStart();
  }, [fetchFromStart]);

  return {
    data,
    error,
    isFetching,
    isPending,
    hasNextPage: !!nextPage,
    loadNextPage,
    refetch: fetchFromStart,
  };
};

export const useGetQcWorkOrder = (
  workOrderId: string,
): QcRequestState<QcWorkOrder> => {
  const [data, setData] = useState<QcWorkOrder>();
  const [error, setError] = useState<any>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isPending, setIsPending] = useState(true);
  const requestIdRef = useRef(0);

  const refetch = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setError(null);
    setIsPending(true);
    setIsFetching(true);

    try {
      const params: QcApiGetQcWorkOrderArgs = { workOrderId };
      const response = USE_MOCK_QC_API
        ? await MockQcWorkOrdersApi.getQcWorkOrder(params)
        : await QcApiClient.getQcWorkOrder(params);

      if (requestIdRef.current === requestId) {
        setData(response.data);
      }
    } catch (e) {
      if (requestIdRef.current === requestId) {
        setError(e);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsFetching(false);
        setIsPending(false);
      }
    }
  }, [workOrderId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    data,
    error,
    isFetching,
    isPending,
    refetch,
  };
};

export const useListQcWorkOrderTasks = (
  workOrderId: string,
  { pageSize = 100, fetchAll = true }: UseQcWorkOrderTasksOptions = {},
): QcRequestState<QcTaskCollection> => {
  const [data, setData] = useState<QcTaskCollection>({ items: [] });
  const [error, setError] = useState<any>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isPending, setIsPending] = useState(true);
  const requestIdRef = useRef(0);

  const fetchPage = useCallback(
    async (
      params: QcApiListQcWorkOrderTasksArgs,
    ): Promise<{ data: QcTaskCollection; nextPage?: string }> => {
      const response = USE_MOCK_QC_API
        ? await MockQcWorkOrdersApi.listQcWorkOrderTasks(params)
        : await QcApiClient.listQcWorkOrderTasks(params);

      return {
        data: response.data,
        nextPage: response.response.headers.get("opc-next-page") ?? undefined,
      };
    },
    [],
  );

  const refetch = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setError(null);
    setIsPending(true);
    setIsFetching(true);

    try {
      let currentParams: QcApiListQcWorkOrderTasksArgs = {
        workOrderId,
        limit: pageSize,
      };
      let accumulated: QcTaskCollection = { items: [] };
      let page: string | undefined;

      do {
        const result = await fetchPage(currentParams);
        accumulated = {
          items: [...accumulated.items, ...(result.data.items ?? [])],
        };
        page = result.nextPage;
        currentParams = { workOrderId, limit: pageSize, page };
      } while (fetchAll && page);

      if (requestIdRef.current === requestId) {
        setData(accumulated);
      }
    } catch (e) {
      if (requestIdRef.current === requestId) {
        setError(e);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsFetching(false);
        setIsPending(false);
      }
    }
  }, [fetchAll, fetchPage, pageSize, workOrderId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    data,
    error,
    isFetching,
    isPending,
    refetch,
  };
};
