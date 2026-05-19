import { getIdeApiBase, getLvvApiBase } from "../../config/api";

export const LVV_API = getLvvApiBase();
export const IDE_API = getIdeApiBase();

export const VALIDATION_TABLE_ACCESSIBILITY = { rowHeader: "ActionItems" } as const;

export const POLLING = {
  MAX_ATTEMPTS: 60,
  INTERVAL_MS: 10000,
};
