import { getIdeApiBase } from "../../../config/api";
import { createCsrfHeaders, fetchWithRetry } from "../../rack/api";

export const CABLING_UI_ACTIONS = {
  DOWNLOAD_EASY_MARKS: "downloadEasyMarks",
  DOWNLOAD_MATERIALS: "downloadMaterials",
} as const;

type UiMetricDimensions = Record<string, unknown>;

type EmitUiMetricPayload = {
  actionName: string;
  dimensions: Record<string, string>;
};

function toTagValue(value: unknown, fallback = "unknown"): string {
  if (value === null || value === undefined) return fallback;
  const result = String(value).trim();
  return result === "" ? fallback : result;
}

function toTagMap(dimensions: UiMetricDimensions): Record<string, string> {
  return Object.fromEntries(
    Object.entries(dimensions).map(([key, value]) => [key, toTagValue(value)]),
  );
}

export async function emitCablingUiMetric(
  actionName: string,
  dimensions: UiMetricDimensions,
): Promise<void> {
  const payload: EmitUiMetricPayload = {
    actionName,
    dimensions: toTagMap(dimensions),
  };

  try {
    console.info("Emitting cabling UI metric", {
      actionName,
      dimensions: payload.dimensions,
    });

    const headers = createCsrfHeaders();
    headers.append("Content-Type", "application/json");

    const response = await fetchWithRetry(
      `${getIdeApiBase()}/uiMetrics`,
      {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(payload),
      },
      3,
    );

    if (!response.ok) {
      console.warn(
        `Cabling UI metric emission failed (${response.status} ${response.statusText})`,
        {
          actionName,
          status: response.status,
          statusText: response.statusText,
        },
      );
      return;
    }

    console.info("Cabling UI metric accepted", {
      actionName,
      status: response.status,
    });
  } catch (error) {
    console.warn("Cabling UI metric emission failed", {
      actionName,
      error,
    });
  }
}
