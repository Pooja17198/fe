import { getLvvApiBase } from "../../config/api";
import { createCsrfHeaders, fetchWithRetry } from "../rack/api";
import type {
  DeploymentGroupJobMetadata,
  DeploymentGroupJobStatus,
  DeploymentGroupValidationResults,
  RackMetadata,
} from "./types";

function lvvApi(path: string): string {
  return `${getLvvApiBase()}${path}`;
}

export function normalizeDeploymentGroupStatus(value: unknown): DeploymentGroupJobStatus {
  const normalized = String(value || "").trim().toUpperCase();
  if (
    normalized === "IN_PROGRESS" ||
    normalized === "COMPLETED" ||
    normalized === "FAILED" ||
    normalized === "VALIDATION_TIMED_OUT" ||
    normalized === "DEVICE_UNREACHABLE" ||
    normalized === "NOT_TRIGGERED"
  ) {
    return normalized;
  }
  return "NOT_TRIGGERED";
}

export function normalizeDeploymentGroupStatusPayload(payload: unknown): DeploymentGroupJobStatus {
  if (Array.isArray(payload)) {
    const statuses = payload
      .map((item) => {
        const record = asRecord(item);
        return normalizeDeploymentGroupStatus(
          record?.jobStatus ?? record?.status ?? record?.validationStatus
        );
      });

    if (statuses.length === 0) {
      return "NOT_TRIGGERED";
    }
    if (statuses.includes("IN_PROGRESS")) {
      return "IN_PROGRESS";
    }
    if (statuses.every((status) => status === "COMPLETED")) {
      return "COMPLETED";
    }

    const terminalPriority: DeploymentGroupJobStatus[] = [
      "DEVICE_UNREACHABLE",
      "VALIDATION_TIMED_OUT",
      "FAILED",
      "COMPLETED",
    ];
    return terminalPriority.find((status) => statuses.includes(status)) || "NOT_TRIGGERED";
  }

  const record = asRecord(payload);
  return normalizeDeploymentGroupStatus(record?.jobStatus ?? record?.status ?? payload);
}

export function buildDeploymentGroupJobStatusRequestBody(
  rackSerialByRackNumber: Record<string, string>
): { rackNumberToRackSerialMap: Record<string, string> } {
  return { rackNumberToRackSerialMap: rackSerialByRackNumber };
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function rackNumberLookupFailureMessage(hostSerial: string): string {
  return `Failed to get rack number from Cerebro using this host serial: ${hostSerial}.`;
}

function buildAvailabilityDomainCandidates(region: string): string[] {
  return [1, 2, 3].map((index) => `${region}-ad-${index}`);
}

function normalizeRackMetadataPayload(payload: unknown): RackMetadata[] {
  const record = asRecord(payload);
  const rawRows = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.racks)
      ? record?.racks
      : Array.isArray(record?.rackLocationDetails)
        ? record?.rackLocationDetails
        : Array.isArray(record?.items)
          ? record?.items
          : [];

  return rawRows
    .map((raw) => asRecord(raw))
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .map((row) => ({
      rackNumber: text(row.rackNumber ?? row.rackLocation ?? row.rack ?? row.rackPosition),
      rackSerialNumber: text(row.rackSerialNumber ?? row.rackSerial ?? row.serialNumber),
      block: text(row.block ?? row.blockName ?? row.cfabBlock),
      platformName: text(row.platformName ?? row.platform ?? row.rackSku),
    }))
    .filter((row) => row.rackNumber !== "");
}

async function readJsonOrEmpty(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body.trim()) {
    return {};
  }
  return JSON.parse(body) as unknown;
}

export async function fetchDeploymentGroupRackMetadata(params: {
  region: string;
  building: string;
  rackNumbers: string[];
  signal?: AbortSignal;
}): Promise<RackMetadata[]> {
  const url = new URL(lvvApi("/rackLocationDetails"));
  url.searchParams.set("buildingName", params.building);
  url.searchParams.set("regionName", params.region);
  params.rackNumbers.forEach((rackNumber) => {
    url.searchParams.append("rackNumber", rackNumber);
  });

  const response = await fetchWithRetry(url.href, {
    method: "GET",
    signal: params.signal,
  });
  if (!response.ok) {
    throw new Error(`Rack metadata request failed: ${response.status} ${response.statusText}`);
  }

  return normalizeRackMetadataPayload(await readJsonOrEmpty(response));
}

export async function fetchRackNumberByHostSerial(params: {
  region: string;
  hostSerial: string;
  signal?: AbortSignal;
}): Promise<string> {
  const hostSerial = params.hostSerial.trim();
  if (!hostSerial) {
    throw new Error("Host serial is required.");
  }

  for (const availabilityDomain of buildAvailabilityDomainCandidates(params.region)) {
    const url = new URL(lvvApi("/rackNumber"));
    url.searchParams.set("regionName", params.region);
    url.searchParams.set("availabilityDomain", availabilityDomain);
    url.searchParams.set("hostSerial", hostSerial);

    let response: Response;
    try {
      response = await fetchWithRetry(url.href, {
        method: "GET",
        signal: params.signal,
      });
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw error;
      }
      continue;
    }

    if (!response.ok) {
      continue;
    }

    const payload = asRecord(await readJsonOrEmpty(response));
    const rackNumber = text(payload?.rackNumber);
    if (rackNumber) {
      return rackNumber;
    }
  }

  throw new Error(rackNumberLookupFailureMessage(hostSerial));
}

export async function fetchDeploymentGroupJobMetadata(params: {
  region: string;
  building: string;
  deploymentGroup: string;
  signal?: AbortSignal;
}): Promise<DeploymentGroupJobMetadata> {
  const url = new URL(lvvApi("/getDeploymentGroupValidationJobMetadata"));
  url.searchParams.set("regionName", params.region);
  url.searchParams.set("buildingName", params.building);
  url.searchParams.set("deploymentGroup", params.deploymentGroup);

  const response = await fetchWithRetry(url.href, { method: "GET", signal: params.signal });
  if (!response.ok) {
    if (response.status === 404) {
      return { jobStatus: "NOT_TRIGGERED", lastUpdatedTime: null, jobId: null };
    }
    throw new Error(`Deployment group metadata request failed: ${response.status} ${response.statusText}`);
  }

  const payload = asRecord(await readJsonOrEmpty(response)) || {};
  return {
    jobStatus: normalizeDeploymentGroupStatusPayload(payload),
    lastUpdatedTime: text(payload.lastUpdatedTime) || null,
    jobId: text(payload.jobId) || null,
  };
}

export async function fetchDeploymentGroupValidationResults(params: {
  region: string;
  building: string;
  rackSerialNumbers: string[];
  signal?: AbortSignal;
}): Promise<DeploymentGroupValidationResults> {
  const rackSerialNumbers = params.rackSerialNumbers
    .map((rackSerialNumber) => rackSerialNumber.trim())
    .filter(Boolean);

  if (rackSerialNumbers.length === 0) {
    return {};
  }

  const url = new URL(lvvApi("/getDeploymentGroupValidationResults"));
  url.searchParams.set("regionName", params.region);
  url.searchParams.set("buildingName", params.building);

  const headers = createCsrfHeaders();
  headers.append("Content-Type", "application/json");

  const response = await fetchWithRetry(url.href, {
    method: "POST",
    headers,
    body: JSON.stringify({ racks: rackSerialNumbers }),
    signal: params.signal,
  });
  if (!response.ok) {
    throw new Error(`Deployment group results request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await readJsonOrEmpty(response);
  return asRecord(payload) || {};
}

export async function startDeploymentGroupValidationJob(params: {
  region: string;
  building: string;
  deploymentGroup: string;
  signal?: AbortSignal;
}): Promise<void> {
  const url = new URL(lvvApi("/cablingValidation"));
  url.searchParams.set("regionName", params.region);
  url.searchParams.set("buildingName", params.building);
  url.searchParams.set("deploymentGroup", params.deploymentGroup);

  const response = await fetchWithRetry(url.href, {
    method: "POST",
    headers: createCsrfHeaders(),
    signal: params.signal,
  });
  if (!response.ok) {
    throw new Error(`Deployment group validation request failed: ${response.status} ${response.statusText}`);
  }
}

export async function fetchDeploymentGroupJobStatus(params: {
  region: string;
  building: string;
  deploymentGroup: string;
  rackSerialByRackNumber: Record<string, string>;
  lastAttempt: boolean;
  signal?: AbortSignal;
}): Promise<DeploymentGroupJobStatus> {
  const url = new URL(lvvApi("/getDeploymentGroupValidationJobStatus"));
  url.searchParams.set("regionName", params.region);
  url.searchParams.set("buildingName", params.building);
  url.searchParams.set("deploymentGroup", params.deploymentGroup);
  url.searchParams.set("lastAttempt", String(params.lastAttempt));

  const headers = createCsrfHeaders();
  headers.append("Content-Type", "application/json");

  const response = await fetchWithRetry(url.href, {
    method: "POST",
    headers,
    body: JSON.stringify(buildDeploymentGroupJobStatusRequestBody(params.rackSerialByRackNumber)),
    signal: params.signal,
  });
  if (!response.ok) {
    throw new Error(`Deployment group polling request failed: ${response.status} ${response.statusText}`);
  }

  return normalizeDeploymentGroupStatusPayload(await readJsonOrEmpty(response));
}
