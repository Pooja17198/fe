import { createCsrfHeaders, fetchWithRetry } from "../rack/api";

const LVV_API = window.location.host.includes('localhost') ? "http://localhost:21000/lvv" : `https://${window.location.host}/lvv`;

export const TELEMETRY_METRICS = {
    PROJECT_DETAILS_TABLE_LOAD_LATENCY: "project_details_table_load_latency",
    VALIDATION_RESULT_DISPLAY_LATENCY: "validation_result_display_latency",
} as const;

export type MetricDimensions = Record<string, unknown>;

type EmitMetricPayload = {
    metricName: string;
    time: number;
    dimensions: Record<string, string>;
};

export function toDimensionValue(value: unknown, fallback = "unknown"): string {
    if (value === null || value === undefined) return fallback;
    const result = String(value).trim();
    return result === "" ? fallback : result;
}

export function toDimensionMap(dimensions: MetricDimensions): Record<string, string> {
    return Object.fromEntries(
        Object.entries(dimensions).map(([key, value]) => [key, toDimensionValue(value)])
    );
}

export async function emitMetric(
    metricName: string,
    timeMs: number,
    dimensions: MetricDimensions
): Promise<void> {
    const payload: EmitMetricPayload = {
        metricName: metricName,
        time: Math.max(0, Math.round(timeMs)),
        dimensions: toDimensionMap(dimensions),
    };

    try {
        const headers = createCsrfHeaders();
        headers.append("Content-Type", "application/json");

        const response = await fetchWithRetry(`${LVV_API}/emitMetrics`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        }, 3);

        if (!response.ok) {
            let errorText = `${response.status} ${response.statusText}`;
            try {
                const contentType = response.headers.get("content-type") || "";
                if (contentType.includes("application/json")) {
                    const errorJson = await response.json();
                    errorText = (errorJson && (errorJson.message || errorJson.error || JSON.stringify(errorJson))) || errorText;
                } else {
                    const text = await response.text();
                    if (text) errorText = text;
                }
            } catch {
                // Ignore response parsing issues; keep fallback error text.
            }

            console.warn("Telemetry emission failed", {
                metricName,
                timeMs: payload.time,
                dimensions: payload.dimensions,
                error: errorText,
            });
        }
    } catch (error) {
        console.warn("Telemetry emission failed", {
            metricName,
            timeMs: payload.time,
            dimensions: payload.dimensions,
            error,
        });
    }
}
