import { MockRoomLayoutApi } from "../mockAPI/MockRoomLayoutApi";
import {
  MaterialCollection,
  MaterialSummary,
  PhysicalConnectionCollection,
  PhysicalConnectionImageResponse,
  PhysicalConnectionSummary,
  RoomLayout,
  RoomMetadata,
} from "../../../../../../gen/clients/ide-lvv-client";
import { useQuery } from "@ehrc/preact-hooks";
import {
  RoomMetadataApiClient,
  MaterialApiClient,
  PhysicalConnectionApiClient,
  RoomMetadataLayoutApiClient,
} from "../apiClients";
import { MockRoomMetadataApi } from "../mockAPI/MockRoomMetadataApi";
import { MockConnectionsApi } from "../mockAPI/MockConnectionsApi";
import { MockMaterialApi } from "../mockAPI/MockMaterialApi";
import { MockPhysicalConnectionRackToRackApi } from "../mockAPI/MockPhysicalConnectionRackToRack";

export const useRoomMetadata = (mockData?: boolean) => {
  return useQuery<RoomMetadata[] | undefined>({
    queryFn: mockData
      ? () =>
          MockRoomMetadataApi.listRoomMetadata().then(
            (response) => response.data.items,
          )
      : () =>
          RoomMetadataApiClient.getRoomMetadata().then(
            (response) => response.data.items,
          ),
    enabled: true,
  });
};

export const useRoomLayout = (mockData?: boolean) => {
  return useQuery<RoomLayout, [string]>({
    queryFn: mockData
      ? (roomName: string) =>
          MockRoomLayoutApi.getRoomLayout({ roomName }).then(
            (response) => response.data,
          )
      : (roomName: string) =>
          RoomMetadataLayoutApiClient.getRoomMetadataLayout({ roomName }).then(
            (response) => response.data,
          ),
    enabled: false,
  });
};

export const useListMaterial = (mockData?: boolean) => {
  return useQuery<MaterialCollection, [string]>({
    queryFn: mockData
      ? (roomName: string) => MockMaterialApi.listMaterial({ roomName }).then(
            (response) => response.data,
        )
      : (roomName: string) =>
          getListWithAllPages<MaterialSummary>(MaterialApiClient.listMaterials.bind(MaterialApiClient), {
            roomName,
            limit: 100
          }).then((response) => response),
    enabled: false,
  });
};

export const useConnections = (mockData?: boolean) => {
  return useQuery<PhysicalConnectionCollection, [string]>({
    queryFn: mockData
      ? (roomName: string) =>
          MockConnectionsApi.getConnections({ roomName }).then(
            (response) => response.data,
          )
      : (roomName: string) =>
          getListWithAllPages<PhysicalConnectionSummary>(
            PhysicalConnectionApiClient.listPhysicalConnections.bind(PhysicalConnectionApiClient),
            { roomName, limit: 100 },
          ).then((response) => response),
    enabled: false,
  });
};

export const useRackToRackConnections = (mockData?: boolean) => {
  return useQuery<PhysicalConnectionImageResponse, [string, string, string]>({
    queryFn: mockData
      ? (
          roomName: string,
          sourceRackNumber: string,
          destinationRackNumber: string,
        ) =>
          MockPhysicalConnectionRackToRackApi.getPhysicalConnectionRackToRack({
            roomName,
            sourceRackNumber,
            destinationRackNumber,
          }).then((response) => response.data)
      : (
          roomName: string,
          sourceRackNumber: string,
          destinationRackNumber: string,
        ) =>
          PhysicalConnectionApiClient.getPhysicalConnectionImage({
            roomName,
            sourceRackNumber,
            destinationRackNumber,
          }).then((response) => response.data),
    enabled: false,
  });
};

type ListFn<T> = (
  params: {
    roomName: string;
    page?: string;
  },
  options?: any,
) => Promise<{ response: Response; data: Collection<T> }>;

type Collection<T> = { items: T[] };

/**
 * Fetches all pages of materials, following the "opc-next-page" header.
 */
const getListWithAllPages = async <T> (
  listFn: ListFn<T>,
  params: {
    roomName: string;
    bomId?: number;
    limit?: number;
    page?: string;
    sortOrder?: string;
    sortBy?: string;
    opcRequestId?: string;
  },
  options?: any,
): Promise<Collection<T>> => {
  let accumulated: Collection<T> | null = null;
  let page: string | undefined = params.page;

  // defensive copy so we don't mutate original params
  let currentParams = { ...params };

  while (true) {
    if (page !== undefined) {
      currentParams = { ...currentParams, page };
    }

    const { response, data } = await listFn(currentParams, options);

    if (!accumulated) {
      // first page
      accumulated = { ...data };
    } else {
      // merge items (adjust if your collection uses different field name)
      accumulated.items = [...(accumulated.items ?? []), ...(data.items ?? [])];
      // merge other fields if needed
    }

    const nextPage = response.headers.get("opc-next-page");
    if (!nextPage) break;

    page = nextPage;
  }

  // if the API might return empty result and not even one page fetched
  if (!accumulated) {
    accumulated = {
      items: [],
      // add any other required fields with sensible defaults
    } as Collection<T>;
  }

  return accumulated;
}
