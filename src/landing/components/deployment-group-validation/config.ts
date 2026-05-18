import deploymentGroupConfig from "../home/mockAPI/deployment-group-config.json";
import type { DeploymentGroupConfig } from "./types";

const config = deploymentGroupConfig as DeploymentGroupConfig;

export function getDeploymentGroupBuildings(region: string): string[] {
  return Object.keys(config[region] || {}).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true })
  );
}

export function getDeploymentGroupNames(region: string, building: string): string[] {
  return Object.keys(config[region]?.[building] || {}).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true })
  );
}

export function getDeploymentGroupRackNumbers(
  region: string,
  building: string,
  deploymentGroup: string
): string[] {
  return (config[region]?.[building]?.[deploymentGroup] || [])
    .map((rackNumber) => String(rackNumber).trim())
    .filter(Boolean);
}
