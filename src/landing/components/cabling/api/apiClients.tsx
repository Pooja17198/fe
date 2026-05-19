import {
  MaterialApi,
  PhysicalConnectionApi,
  RoomMetadataApi,
  RoomMetadataByRoomApi,
  RoomMetadataLayoutApi,
  BuildArtifactsApi,
  PhysicalCutsheetApi,
  RackViewApi,
  QcApi,
} from "../../../../../gen/clients/ide-lvv-client";


const dxfPaths: { [env: string]: string } = {
  local: "http://localhost:21000/idelvv",
  dev: "https://lvv.us-phoenix-1.oci.oc-test.com/idelvv",
  preprod: "https://lvv.us-phoenix-1.oci.oc-test.com/idelvv",
  prod: "https://lvv.us-phoenix-1.oci.oraclecloud.com/idelvv",
};

let paths = {
  dxfPath: dxfPaths["local"],
};
if (window.location.host.includes("oraclecloud")) {
  // Prod API
  paths = {
    dxfPath: dxfPaths["prod"],
  };
} else if (window.location.host.includes("oc-test")) {
  // dev API
  paths = {
    dxfPath: dxfPaths["dev"],
  };
}

export const QcApiBasePath = paths.dxfPath;

const withSplatCsrfHeader = (request: Request) => {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return Promise.resolve(request);
  }

  const headers = new Headers(request.headers);
  headers.set("X-OCI-Splat-CSRF", "1");

  return Promise.resolve(new Request(request, { headers }));
};

export const MaterialApiClient = new MaterialApi(
  window.fetch.bind(window),
  paths.dxfPath,
);

export const PhysicalConnectionApiClient = new PhysicalConnectionApi(
  window.fetch.bind(window),
  paths.dxfPath,
);

export const RoomMetadataApiClient = new RoomMetadataApi(
  window.fetch.bind(window),
  paths.dxfPath,
);

export const RoomMetadataByRoomApiClient = new RoomMetadataByRoomApi(
  window.fetch.bind(window),
  paths.dxfPath,
);

export const RoomMetadataLayoutApiClient = new RoomMetadataLayoutApi(
  window.fetch.bind(window),
  paths.dxfPath,
);

export const BuildArtifactsApiClient = new BuildArtifactsApi(
  window.fetch.bind(window),
  paths.dxfPath,
);

export const PhysicalCutsheeAPIClient = new PhysicalCutsheetApi(
  window.fetch.bind(window),
  paths.dxfPath,
);

export const RackViewApiClient = new RackViewApi(
  window.fetch.bind(window),
  paths.dxfPath,  
);
export const QcApiClient = new QcApi(
  window.fetch.bind(window),
  paths.dxfPath,
  {
    requestInterceptors: [withSplatCsrfHeader],
  },
)
