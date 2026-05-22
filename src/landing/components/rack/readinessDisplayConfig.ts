export const READINESS_STATES_WITH_REAL_ERRORS = new Set<string>([
  "CPV-REPAIR",
  "LVV",
  "CPV-TESTING",
]);

export const HOST_TRANSCEIVER_METRIC_DISPLAY_STATES = new Set<string>([
  "CPV-EMPTY",
  "CPV-INIT",
  "LVV",
  "CPV-TESTING",
  "CPV-REPAIR",
  "CUSTOMER-EMPTY",
  "CUSTOMER",
]);

export const NOT_READY_FOR_LVV_LABEL = "NOT_READY_FOR_LVV";

export const NOT_READY_FOR_LVV_TOOLTIP =
  "This device is not testable for LVV right now. Validation error details may be inaccurate, and they are hidden by default.";

export function shouldDisplayHostTransceiverMetrics(hostReadinessStatus?: string | null): boolean {
  const normalizedStatus = String(hostReadinessStatus || "").trim().toUpperCase();
  return HOST_TRANSCEIVER_METRIC_DISPLAY_STATES.has(normalizedStatus);
}
