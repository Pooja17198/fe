import { PERIODIC_VALIDATION_REFRESH_CONFIG } from "./featureFlags";

export type PeriodicValidationRefreshConfig = {
  enabled: boolean;
  regions: Array<{
    name: string;
    buildings?: Array<
      | string
      | {
        name: string;
        blocks?: string[];
      }
    >;
  }>;
  rackSerials: string[];
  rackTypes: {
    gpuRack: boolean;
    nonGpuRack: boolean;
  };
  deviceTypes: {
    gpuHost: boolean;
    nonGpuDevice: boolean;
  };
};

export type PeriodicValidationRefreshDeviceType = "gpuHost" | "nonGpuDevice";

export type PeriodicValidationRefreshContext = {
  region?: string | null;
  building?: string | null;
  block?: string | null;
  rackSerial?: string | null;
  isGpuRack?: boolean;
};

function normalizeConfigValue(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function matchesRegionAndBuilding(
    configuredRegions: PeriodicValidationRefreshConfig["regions"],
    region: string | null | undefined,
    building: string | null | undefined,
    block: string | null | undefined
): boolean {
  if (configuredRegions.length === 0) {
    return true;
  }

  const normalizedRegion = normalizeConfigValue(region);
  if (!normalizedRegion) {
    return false;
  }

  const matchedRegion = configuredRegions.find(
      (configuredRegion) => normalizeConfigValue(configuredRegion.name) === normalizedRegion
  );
  if (!matchedRegion) {
    return false;
  }

  const configuredBuildings = matchedRegion.buildings || [];
  if (configuredBuildings.length === 0) {
    return true;
  }

  const normalizedBuilding = normalizeConfigValue(building);
  if (!normalizedBuilding) {
    return false;
  }

  return configuredBuildings.some((configuredBuildingEntry) => {
    if (typeof configuredBuildingEntry === "string") {
      return normalizeConfigValue(configuredBuildingEntry) === normalizedBuilding;
    }

    if (normalizeConfigValue(configuredBuildingEntry.name) !== normalizedBuilding) {
      return false;
    }

    const configuredBlocks = configuredBuildingEntry.blocks || [];
    if (configuredBlocks.length === 0) {
      return true;
    }

    const normalizedBlock = normalizeConfigValue(block);
    if (!normalizedBlock) {
      return false;
    }

    return configuredBlocks.some(
        (configuredBlock) => normalizeConfigValue(configuredBlock) === normalizedBlock
    );
  });
}

function matchesRackSerial(
    configuredRackSerials: PeriodicValidationRefreshConfig["rackSerials"],
    rackSerial: string | null | undefined
): boolean {
  if (configuredRackSerials.length === 0) {
    return true;
  }

  const normalizedRackSerial = normalizeConfigValue(rackSerial);
  if (!normalizedRackSerial) {
    return false;
  }

  return configuredRackSerials.some(
      (configuredRackSerial) => normalizeConfigValue(configuredRackSerial) === normalizedRackSerial
  );
}

export function isPeriodicValidationRefreshEnabledForRack(
    context: PeriodicValidationRefreshContext
): boolean {
  if (!PERIODIC_VALIDATION_REFRESH_CONFIG.enabled) {
    return false;
  }

  if (!matchesRegionAndBuilding(
      PERIODIC_VALIDATION_REFRESH_CONFIG.regions,
      context.region,
      context.building,
      context.block
  )) {
    return false;
  }

  if (!matchesRackSerial(
      PERIODIC_VALIDATION_REFRESH_CONFIG.rackSerials,
      context.rackSerial
  )) {
    return false;
  }

  if (Boolean(context.isGpuRack)) {
    return PERIODIC_VALIDATION_REFRESH_CONFIG.rackTypes.gpuRack;
  }

  return PERIODIC_VALIDATION_REFRESH_CONFIG.rackTypes.nonGpuRack;
}

export function isPeriodicValidationRefreshEnabledForDeviceType(
    deviceType: PeriodicValidationRefreshDeviceType
): boolean {
  if (deviceType === "gpuHost") {
    return PERIODIC_VALIDATION_REFRESH_CONFIG.deviceTypes.gpuHost;
  }

  return PERIODIC_VALIDATION_REFRESH_CONFIG.deviceTypes.nonGpuDevice;
}

export function isPeriodicValidationRefreshEnabledForAllDevices(): boolean {
  return (
    PERIODIC_VALIDATION_REFRESH_CONFIG.deviceTypes.gpuHost &&
    PERIODIC_VALIDATION_REFRESH_CONFIG.deviceTypes.nonGpuDevice
  );
}
