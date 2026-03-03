import { DeviceStatus } from "./types";

export function anyJobInProgress(data: DeviceStatus[]): boolean {
  return data.some((item) => (item.jobStatus || "").includes("IN_PROGRESS"));
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
