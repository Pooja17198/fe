import { PeriodicValidationRefreshConfig } from "./configUtils";

// Dev-team controlled feature flags (build-time constants).
// Update values here and redeploy. (true or false)
export const ENABLE_NETWORK_MONITORING = true;

// Update values here and redeploy.

export const PERIODIC_VALIDATION_REFRESH_CONFIG: PeriodicValidationRefreshConfig = {
  enabled: true,
  // Periodic refresh does NOT replace manual validation.
  // All supported devices still enter validation only when the user clicks Validate.
  // After a validation run completes, the UI promotes only devices that currently show
  // "Optic Errors" into Periodic Check mode. Those devices alone:
  // - call the validation-service-backed periodic refresh endpoint,
  // - show the per-device Refresh control, and
  // - show the "Last validated" timestamp.
  // Devices without optic errors remain manual-validation devices.
  // Leave regions empty to enable periodic refresh in all regions.
  // If regions are provided, only those regions are enabled.
  // Within a region, leave buildings empty to enable all buildings in that region.
  // If buildings are provided, only those buildings are enabled for that region.
  // Each building entry can be either:
  // - a string like "aga5" to enable all blocks in that building, or
  // - an object like { name: "aga5", blocks: ["b1", "b2"] } to scope it to blocks.
  // If blocks is omitted or [] for a building object, periodic refresh applies to all
  // blocks in that building.
  regions: [
    { name: "us-saltlake-2", buildings: ["aga5"] },
    { name: "ap-kulai-2", buildings: ["jbp15", "jbp19"] },
    { name: "us-phoenix-1", buildings: ["phx20", "phx23"] },
    { name: "us-ashburn-1", buildings: ["iad65"] },
    { name: "ap-batam-1", buildings: ["hsg17"] }
  ],
  // Leave rackSerials empty to enable periodic refresh for all racks matched by the
  // other config filters. If rackSerials are provided, only those rack serials are enabled.
  rackSerials: [],
  // Example:
  // regions: [
  //   { name: "us-phoenix-1" },
  //   { name: "us-ashburn-1", buildings: ["iad10", { name: "iad58", blocks: ["block-a"] }] },
  // ],
  // rackSerials: ["RACK123456", "RACK654321"],
  // These rack/device switches are intentionally broad. The real runtime gate for
  // Periodic Check is optic-error presence in the latest validation results.
  rackTypes: {
    gpuRack: false,
    nonGpuRack: true,
  },
  deviceTypes: {
    gpuHost: false,
    nonGpuDevice: true,
  },
};
