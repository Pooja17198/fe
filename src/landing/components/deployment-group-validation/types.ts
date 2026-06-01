import type { RackValidationSummary } from "../rack/validationShared";

export type DeploymentGroupJobStatus =
  | "NOT_TRIGGERED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "VALIDATION_TIMED_OUT"
  | "DEVICE_UNREACHABLE";

export const TERMINAL_DEPLOYMENT_GROUP_STATUSES = new Set<DeploymentGroupJobStatus>([
  "COMPLETED",
  "FAILED",
  "VALIDATION_TIMED_OUT",
  "DEVICE_UNREACHABLE",
]);

export type DeploymentGroupConfig = Record<
  string,
  Record<string, Record<string, string[]>>
>;

export type DeploymentGroupJobMetadata = {
  jobStatus: DeploymentGroupJobStatus;
  lastUpdatedTime: string | null;
  jobId: string | null;
};

export type RackMetadata = {
  rackNumber: string;
  rackSerialNumber: string;
  block: string;
  platformName: string;
  rackState: string;
};

export type DeploymentGroupValidationResults = Record<string, unknown>;

export type DeploymentGroupRackRow = {
  _key: string;
  rackLocation: string;
  rackSerialNumber: string;
  block: string;
  platformName: string;
  isValidated: boolean;
  summary: RackValidationSummary;
  errorSortValue: number;
  detailsHref?: string;
};

export type DeploymentGroupSummary = {
  totalDgRacks: number;
  totalValidatedRacks: number;
  notValidatedRacks: number;
  failedRacks: number;
  aggregate: RackValidationSummary;
};

export type DeploymentGroupRackFilter = "all" | "failed" | "notValidated" | "validated";
