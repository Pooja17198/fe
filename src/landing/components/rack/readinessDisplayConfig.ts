export const READINESS_STATES_WITH_REAL_ERRORS = new Set<string>([
  "CPV-REPAIR",
  "LVV",
  "CPV-TESTING",
]);

export const NOT_READY_FOR_LVV_LABEL = "NOT_READY_FOR_LVV";

export const NOT_READY_FOR_LVV_TOOLTIP =
  "This device is not testable for LVV right now. Validation error details may be inaccurate, and they are hidden by default.";