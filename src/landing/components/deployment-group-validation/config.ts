import deploymentGroupConfig from "../home/mockAPI/deployment-group-config.json";
import type { DeploymentGroupConfig } from "./types";

const config = deploymentGroupConfig as DeploymentGroupConfig;

export type DeploymentGroupRackMatch = {
  building: string;
  deploymentGroup: string;
  rackNumber: string;
};

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

export function findDeploymentGroupByRackNumber(
  region: string,
  rackNumber: string
): DeploymentGroupRackMatch | null {
  const normalizedRackNumber = String(rackNumber || "").trim();
  if (!normalizedRackNumber) {
    return null;
  }

  const matches: DeploymentGroupRackMatch[] = [];
  const regionConfig = config[region] || {};
  Object.entries(regionConfig).forEach(([building, deploymentGroups]) => {
    Object.entries(deploymentGroups || {}).forEach(([deploymentGroup, rackNumbers]) => {
      const normalizedRackNumbers = (rackNumbers || [])
        .map((value) => String(value).trim())
        .filter(Boolean);
      if (normalizedRackNumbers.includes(normalizedRackNumber)) {
        matches.push({
          building,
          deploymentGroup,
          rackNumber: normalizedRackNumber,
        });
      }
    });
  });

  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw new Error(
      `Rack number ${normalizedRackNumber} matches multiple deployment groups in region ${region}. Please use manual deployment group selection.`
    );
  }
  return null;
}
