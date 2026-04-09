import { DeviceStatus } from "./types";

export function anyJobInProgress(data: DeviceStatus[]): boolean {
  return data.some((item) => (item.jobStatus || "").includes("IN_PROGRESS"));
}

export function isGpuComputeDevice(
  deviceName: string,
  isGpuRack?: boolean,
): boolean {
  return Boolean(isGpuRack) && (
    deviceName.toLowerCase().includes("compute")
    || /-gpu-expander\d+$/.test(deviceName.toLowerCase())
  );
}

export function isRackInService(rackState: string | null | undefined): boolean {
  return String(rackState || "").toUpperCase() === "IN-SERVICE";
}

export function isRackValidationAllowed(isGpuRack: boolean | undefined, rackState: string | null | undefined): boolean {
  if (!isGpuRack) return true;
  return isRackInService(rackState);
}

export function getStatusClass(status: string): string {
  const s = (status || "").toUpperCase();
  if (s === "IN_PROGRESS") return "status-in-progress";
  if (s === "COMPLETED") return "status-completed";
  if (s === "NOT_TRIGGERED") return "status-not-triggered";
  if (s === "NOT_ELIGIBLE") return "status-not-eligible";
  return "status-error";
}

export function formatStatusLabel(status: string): string {
  if ((status || "").toUpperCase() === "NOT_ELIGIBLE") {
    return "Not eligible";
  }
  return (status || "")
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function isDeviceStatusCompleted(jobStatus: string | null | undefined): boolean {
  return (jobStatus || "").toUpperCase() === "COMPLETED";
}

export function parseContentDispositionFilename(cdHeader: string, fallback: string): string {
  try {
    const match = cdHeader.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    if (match) {
      return decodeURIComponent((match[1] || match[2]).trim());
    }
  } catch {
    // ignore parsing error and fallback
  }
  return fallback;
}
