import {
  MaterialApi,
  PhysicalConnectionApi,
  RoomMetadataApi,
  RoomMetadataLayoutApi,
  BuildArtifactsApi
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

export const RoomMetadataLayoutApiClient = new RoomMetadataLayoutApi(
  window.fetch.bind(window),
  paths.dxfPath,
);

export const BuildArtifactsApiClient = new BuildArtifactsApi(
  window.fetch.bind(window),
  paths.dxfPath,
)

