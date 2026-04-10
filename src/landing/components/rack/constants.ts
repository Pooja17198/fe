export const LVV_API =
  window.location.host.includes("localhost")
    ? "http://localhost:21000/lvv"
    : `https://${window.location.host}/lvv`;

export const VALIDATION_TABLE_ACCESSIBILITY = { rowHeader: "ActionItems" } as const;

export const POLLING = {
  MAX_ATTEMPTS: 60,
  INTERVAL_MS: 10000,
};
