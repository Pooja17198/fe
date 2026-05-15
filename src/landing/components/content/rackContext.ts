import { getLvvApiBase } from "../../config/api";
import { fetchWithRetry } from "../rack/api";

export type UserType = "master" | "vendor";

export type RackMetadata = {
  building: string;
  block: string;
  rack: string;
  rackState?: string;
  project?: string;
  ticket?: string;
  rackSerialNumber?: string;
  isGpuRack?: boolean;
  availabilityDomain?: string;
  resolveEnabled?: boolean;
  resolveDisabledReason?: string;
  userType?: UserType;
};

type ProjectRackResponse = {
  building?: string;
  block?: string;
  rackLocation?: string;
  rackSerialNumber?: string;
  isGpuRack?: boolean;
  availabilityDomain?: string;
  ticketId?: string;
  ticket?: string;
  resolveEnabled?: boolean;
  resolveDisabledReason?: string;
  rackState?: string;
};

export type ParsedRackUrlContext = {
  isRackUrl: boolean;
  metadata: Partial<RackMetadata>;
  region?: string;
  missingRequiredFields: string[];
  needsBackendHydration: boolean;
};

export type RackUrlHydrationResult = {
  isRackUrl: boolean;
  metadata?: RackMetadata;
  region?: string;
  error?: string;
};

function readParam(params: URLSearchParams, name: string): string {
  return params.get(name)?.trim() || "";
}

function parseOptionalBoolean(params: URLSearchParams, name: string): boolean | undefined {
  if (!params.has(name)) {
    return undefined;
  }
  return params.get(name) === "true";
}

function parseOptionalUserType(params: URLSearchParams): UserType | undefined {
  if (!params.has("userType")) {
    return undefined;
  }
  return params.get("userType") === "master" ? "master" : "vendor";
}

export function getStoredVendorName(): string {
  const storedVendor = sessionStorage.getItem("X-Oracle-Vendor") || "";
  if (storedVendor.trim() !== "") {
    return storedVendor;
  }

  return "";
}

export function parseRackUrlContext(location: Location = window.location): ParsedRackUrlContext {
  const match = location.pathname.match(/^\/rack\/([^/]+)\/?$/);
  if (!match) {
    return {
      isRackUrl: false,
      metadata: {},
      missingRequiredFields: [],
      needsBackendHydration: false,
    };
  }

  const params = new URLSearchParams(location.search);
  const rackSerialNumber = decodeURIComponent(match[1]);
  const region = readParam(params, "region");
  const building = readParam(params, "building");
  const block = readParam(params, "block");
  const rack = readParam(params, "rack");
  const ticket = readParam(params, "ticket") || readParam(params, "ticketId");
  const isGpuRack = parseOptionalBoolean(params, "isGpuRack");

  const metadata: Partial<RackMetadata> = {
    rackSerialNumber,
    building,
    block,
    rack,
    rackState: readParam(params, "rackState"),
    project: readParam(params, "project"),
    isGpuRack,
    availabilityDomain: readParam(params, "availabilityDomain"),
    userType: parseOptionalUserType(params),
  };

  if (ticket) {
    metadata.ticket = ticket;
    metadata.resolveEnabled = true;
  } else {
    const resolveEnabled = parseOptionalBoolean(params, "resolveEnabled");
    if (typeof resolveEnabled === "boolean") {
      metadata.resolveEnabled = resolveEnabled;
    }
    if (params.has("resolveDisabledReason")) {
      metadata.resolveDisabledReason = readParam(params, "resolveDisabledReason");
    }
  }

  const requiredFields: Array<[string, string | undefined]> = [
    ["region", region],
    ["building", building],
    ["block", block],
    ["rack", rack],
  ];
  const missingRequiredFields = requiredFields
    .filter(([, value]) => !value)
    .map(([name]) => name);

  const hasResolveContext =
    Boolean(ticket) || params.has("resolveEnabled") || params.has("resolveDisabledReason");
  const needsBackendHydration =
    !metadata.rackState || typeof isGpuRack !== "boolean" || !hasResolveContext;

  return {
    isRackUrl: true,
    metadata,
    region,
    missingRequiredFields,
    needsBackendHydration,
  };
}

function mapBackendRackContext(
  parsed: ParsedRackUrlContext,
  backendRack: ProjectRackResponse
): RackMetadata {
  const metadata = parsed.metadata;
  const ticket = backendRack.ticketId || backendRack.ticket || metadata.ticket || "";

  return {
    building: backendRack.building || metadata.building || "",
    block: backendRack.block || metadata.block || "",
    rack: backendRack.rackLocation || metadata.rack || "",
    rackState: backendRack.rackState || metadata.rackState || "",
    project: metadata.project || "",
    ticket: ticket || undefined,
    rackSerialNumber: backendRack.rackSerialNumber || metadata.rackSerialNumber || "",
    isGpuRack:
      typeof backendRack.isGpuRack === "boolean"
        ? backendRack.isGpuRack
        : Boolean(metadata.isGpuRack),
    availabilityDomain: backendRack.availabilityDomain || metadata.availabilityDomain || "",
    userType: metadata.userType,
    resolveEnabled:
      typeof backendRack.resolveEnabled === "boolean"
        ? backendRack.resolveEnabled
        : Boolean(metadata.resolveEnabled),
    resolveDisabledReason:
      backendRack.resolveDisabledReason || metadata.resolveDisabledReason || "",
  };
}

async function canReadAllProjects(region?: string, signal?: AbortSignal): Promise<boolean> {
  const url = new URL(`${getLvvApiBase()}/allProjects`);
  const regionName = region?.trim();
  if (regionName) {
    url.searchParams.set("regionName", regionName);
  }

  try {
    const response = await fetchWithRetry(url.href, {
      method: "GET",
      signal,
    });
    return response.ok;
  } catch (error) {
    if ((error as any)?.name === "AbortError") {
      throw error;
    }
    return false;
  }
}

export async function resolveCurrentUserType(
  region?: string,
  signal?: AbortSignal
): Promise<UserType> {
  return (await canReadAllProjects(region, signal)) ? "master" : "vendor";
}

async function fetchRackContext(
  parsed: ParsedRackUrlContext,
  signal?: AbortSignal
): Promise<RackMetadata> {
  const metadata = parsed.metadata;
  const url = new URL(`${getLvvApiBase()}/rackContext`);
  url.searchParams.set("rackSerialNumber", String(metadata.rackSerialNumber || ""));
  url.searchParams.set("rackNumber", String(metadata.rack || ""));
  url.searchParams.set("buildingName", String(metadata.building || ""));
  url.searchParams.set("block", String(metadata.block || ""));
  url.searchParams.set("regionName", String(parsed.region || ""));

  const response = await fetchWithRetry(url.href, { method: "GET", signal });
  if (!response.ok) {
    throw new Error(`Rack context request failed: ${response.status} ${response.statusText}`);
  }

  return mapBackendRackContext(parsed, await response.json());
}

export async function hydrateRackUrlContext(
  signal?: AbortSignal
): Promise<RackUrlHydrationResult> {
  const parsed = parseRackUrlContext();
  if (!parsed.isRackUrl) {
    return { isRackUrl: false };
  }

  if (parsed.missingRequiredFields.length > 0) {
    return {
      isRackUrl: true,
      region: parsed.region,
      error: `Missing required rack URL parameters: ${parsed.missingRequiredFields.join(", ")}`,
    };
  }

  const rackMetadata = parsed.needsBackendHydration
    ? await fetchRackContext(parsed, signal)
    : ({
        ...parsed.metadata,
        building: parsed.metadata.building || "",
        block: parsed.metadata.block || "",
        rack: parsed.metadata.rack || "",
        rackSerialNumber: parsed.metadata.rackSerialNumber || "",
        ticket: parsed.metadata.ticket || undefined,
        isGpuRack: Boolean(parsed.metadata.isGpuRack),
        resolveEnabled: Boolean(parsed.metadata.resolveEnabled),
        resolveDisabledReason: parsed.metadata.resolveDisabledReason || "",
      } as RackMetadata);

  return {
    isRackUrl: true,
    region: parsed.region,
    metadata: rackMetadata,
  };
}
