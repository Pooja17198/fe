import {
  mergeRackValidationSummaries,
  normalizeDeviceName,
  normalizeValidationFailuresPayload,
  NOT_VALIDATED_SUMMARY,
  RackValidationSummary,
  summarizeValidationFailuresByDevice,
} from "../rack/validationShared";
import type { ValidationFailuresByDevice } from "../rack/types";
import type {
  DeploymentGroupRackRow,
  DeploymentGroupSummary,
  DeploymentGroupValidationResults,
  RackMetadata,
} from "./types";

const VALIDATED_CLEAN_SUMMARY: RackValidationSummary = {
  ...NOT_VALIDATED_SUMMARY,
  isValidated: true,
};

const IGNORED_DEPLOYMENT_GROUP_DEVICE_NAMES = new Set(["unknown"]);

function toValidatedSummary(summary: RackValidationSummary): RackValidationSummary {
  return summary.isValidated ? summary : VALIDATED_CLEAN_SUMMARY;
}

function omitIgnoredDeploymentGroupDevices(
  failuresByDevice: ValidationFailuresByDevice
): ValidationFailuresByDevice {
  return Object.fromEntries(
    Object.entries(failuresByDevice).filter(
      ([deviceName]) => !IGNORED_DEPLOYMENT_GROUP_DEVICE_NAMES.has(normalizeDeviceName(deviceName))
    )
  );
}

function hasDeploymentGroupRackResult(
  results: DeploymentGroupValidationResults,
  rackSerialNumber: string
): boolean {
  return Boolean(
    rackSerialNumber &&
    Object.prototype.hasOwnProperty.call(results, rackSerialNumber)
  );
}

export function getDeploymentGroupRackValidationFailures(params: {
  rackSerialNumber: string;
  results: DeploymentGroupValidationResults;
}): ValidationFailuresByDevice {
  if (!hasDeploymentGroupRackResult(params.results, params.rackSerialNumber)) {
    return {};
  }

  return omitIgnoredDeploymentGroupDevices(
    normalizeValidationFailuresPayload(params.results, params.rackSerialNumber)
  );
}

export function getRackFailureTotal(summary: RackValidationSummary): number {
  return (
    summary.lldpFailures +
    summary.interfaceFailures +
    summary.opticModuleFailures +
    summary.fecBerFailures +
    summary.hostOptFailures +
    summary.hostFecBerFailures +
    summary.deviceFailures
  );
}

export function buildRackDetailsHref(params: {
  region: string;
  building: string;
  block: string;
  rack: string;
  rackSerialNumber: string;
}): string {
  const url = new URL(`/rack/${encodeURIComponent(params.rackSerialNumber)}`, window.location.origin);
  url.searchParams.set("region", params.region);
  url.searchParams.set("building", params.building);
  url.searchParams.set("block", params.block);
  url.searchParams.set("rack", params.rack);
  return url.href;
}

export function indexRackMetadataByRackNumber(metadata: RackMetadata[]): Record<string, RackMetadata> {
  return metadata.reduce<Record<string, RackMetadata>>((acc, item) => {
    if (item.rackNumber) {
      acc[item.rackNumber] = item;
    }
    return acc;
  }, {});
}

export function buildRackSerialByRackNumber(rows: DeploymentGroupRackRow[]): Record<string, string> {
  return rows.reduce<Record<string, string>>((acc, row) => {
    if (row.rackLocation && row.rackSerialNumber) {
      acc[row.rackLocation] = row.rackSerialNumber;
    }
    return acc;
  }, {});
}

export function buildDeploymentGroupRackRows(params: {
  rackNumbers: string[];
  metadataByRackNumber: Record<string, RackMetadata>;
  results: DeploymentGroupValidationResults;
  region: string;
  building: string;
}): DeploymentGroupRackRow[] {
  return params.rackNumbers.map((rackNumber) => {
    const metadata = params.metadataByRackNumber[rackNumber];
    const rackSerialNumber = metadata?.rackSerialNumber || "";
    const hasResult = hasDeploymentGroupRackResult(params.results, rackSerialNumber);
    const failuresByDevice = getDeploymentGroupRackValidationFailures({
      results: params.results,
      rackSerialNumber,
    });
    const summary = hasResult
      ? toValidatedSummary(summarizeValidationFailuresByDevice(failuresByDevice))
      : NOT_VALIDATED_SUMMARY;

    return {
      _key: rackNumber,
      rackLocation: rackNumber,
      rackSerialNumber,
      block: metadata?.block || "",
      platformName: metadata?.platformName || "",
      isValidated: hasResult,
      summary,
      errorSortValue: getRackFailureTotal(summary),
      detailsHref: rackSerialNumber
        ? buildRackDetailsHref({
            region: params.region,
            building: params.building,
            block: metadata?.block || "",
            rack: rackNumber,
            rackSerialNumber,
          })
        : undefined,
    };
  });
}

export function summarizeDeploymentGroupRows(rows: DeploymentGroupRackRow[]): DeploymentGroupSummary {
  const validatedRows = rows.filter((row) => row.isValidated);
  const failedRows = validatedRows.filter((row) => getRackFailureTotal(row.summary) > 0);

  return {
    totalDgRacks: rows.length,
    totalValidatedRacks: validatedRows.length,
    notValidatedRacks: rows.length - validatedRows.length,
    failedRacks: failedRows.length,
    aggregate: mergeRackValidationSummaries(...validatedRows.map((row) => row.summary)),
  };
}
