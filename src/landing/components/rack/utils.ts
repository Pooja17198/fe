import { DeviceStatus, DeviceValidationFailures } from "./types";

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
  return true;
}

export function hasOpticValidationErrors(
  deviceFailures: DeviceValidationFailures | null | undefined,
): boolean {
  if (!deviceFailures) {
    return false;
  }

  return deviceFailures.sectionOrder.some((sectionKey) => {
    const section = deviceFailures.sections[sectionKey];
    return (
      String(section?.title || "").trim().toLowerCase() === "optic errors" &&
      (section?.rows.length || 0) > 0
    );
  });
}

export function getStatusClass(status: string): string {
  const s = (status || "").toUpperCase();
  if (s === "IN_PROGRESS") return "status-in-progress";
  if (s === "COMPLETED") return "status-completed";
  if (s === "NOT_TRIGGERED") return "status-not-triggered";
  if (s === "NOT_ELIGIBLE") return "status-not-eligible";
  if (s === "NOT_ENABLED") return "status-not-enabled";
  if (s === "PERIODIC_CHECK") return "status-periodic-check";
  return "status-error";
}

export function formatStatusLabel(status: string): string {
  if ((status || "").toUpperCase() === "NOT_ELIGIBLE") {
    return "Not eligible";
  }
  if ((status || "").toUpperCase() === "NOT_ENABLED") {
    return "Not Enabled";
  }
  if ((status || "").toUpperCase() === "PERIODIC_CHECK") {
    return "Periodic Check";
  }
  return (status || "")
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function isDeviceStatusCompleted(jobStatus: string | null | undefined): boolean {
  return (jobStatus || "").toUpperCase() === "COMPLETED";
}

export function formatValidationTimestamp(
  timestamp: string | null | undefined,
  referenceTimeMs?: number,
): string {
  if (!timestamp || timestamp.trim() === "") {
    return "Pending";
  }

  const parsedTimestampMs = Date.parse(timestamp);
  if (!Number.isFinite(parsedTimestampMs)) {
    return timestamp;
  }

  const nowMs = typeof referenceTimeMs === "number" ? referenceTimeMs : Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - parsedTimestampMs) / 1000));

  if (elapsedSeconds < 5) {
    return "Just now";
  }
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds} sec ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} hr ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
  }

  return new Date(parsedTimestampMs).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
