import { h } from "preact";
import { formatValidationTimestamp } from "./utils";

/**
 * Oracle JET template renderers must be functions that accept a context and return a VNode.
 * These are used via <template slot="..." render={...} /> on oj-table.
 */

export const lldpStatusTemplate = (context: any) => {
  const row = (context?.item && context.item.data) || {};
  const value: string = (row.linkStatus || "").toString();
  const isMatch = value.toLowerCase() === "match";
  const isMismatch = value.toLowerCase() === "mismatch";
  const isDown = value.toLowerCase() === "interface_down" || value.toLowerCase() === "down";
  const colorClass =
      isMatch
          ? "oj-text-color-success"
          : isMismatch || isDown
              ? "oj-text-color-danger"
              : "";
  const normalized = isDown ? "DOWN" : value;
  return <span class={colorClass}>{normalized}</span>;
};

export const booleanStatusTemplate = (context: any) => {
  const row = (context?.item && context.item.data) || {};
  const cellValue =
    context?.data ??
    context?.cell?.data ??
    context?.item?.data?.status ??
    context?.item?.data?.lockStatus ??
    context?.item?.data?.["Status"] ??
    context?.item?.data?.["Lock Status"];
  const displayValue = `${cellValue ?? row.status ?? row.lockStatus ?? row["Status"] ?? row["Lock Status"] ?? ""}`.trim();
  const value = displayValue.toLowerCase();
  if (value === "true" || value === "up" || value === "pass") {
    return (
        <span class="oj-text-color-success" aria-label="Status true">
        ✓
      </span>
    );
  }
  if (value === "false" || value === "down" || value === "fail") {
    return (
        <span class="oj-text-color-danger" aria-label="Status false">
        ✗
      </span>
    );
  }
  return <span>{displayValue || "-"}</span>;
};

export const psuStatusTemplate = (hasFailure: boolean) => {
  return hasFailure ? (
      <span class="oj-text-color-danger" aria-label="PSU down">
      ✗
    </span>
  ) : (
      <span class="oj-text-color-success" aria-label="PSU up">
      ✓
    </span>
  );
};

export const patchPanelMatrixTemplate = (context: any) => {
  const row = (context?.item && context.item.data) || {};
  const rawValue = `${row.patchPanelMatrix ?? ""}`.trim();
  const value = rawValue
    ? rawValue.split("•").map((part) => part.trim()).filter(Boolean).join("\n")
    : "Not Available";
  return <div class="patch-panel-matrix-cell">{value}</div>;
};

type RawBerToken = {
  key: string;
  value: string;
};

function parseRawBerEntry(rawEntry: string): RawBerToken[] {
  const normalized = rawEntry.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const tokens: RawBerToken[] = [];
  const pattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*?)(?=\s+[a-zA-Z_][a-zA-Z0-9_]*\s*:|$)/g;

  for (const match of normalized.matchAll(pattern)) {
    const key = (match[1] || "").trim();
    const value = (match[2] || "").trim();
    if (key) {
      tokens.push({ key, value: value || "Not Available" });
    }
  }

  if (tokens.length > 0) {
    return tokens;
  }

  return [{ key: "value", value: normalized }];
}

function getRawBerStatusClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (["pass", "passed", "success", "ok", "healthy"].includes(normalized)) {
    return "raw-ber-token-value-status-pass";
  }
  if (["fail", "failed", "error", "down", "critical"].includes(normalized)) {
    return "raw-ber-token-value-status-fail";
  }
  return "raw-ber-token-value-status-neutral";
}

function formatRawBerEntries(rawValue: unknown): RawBerToken[][] {
  const normalized = `${rawValue ?? ""}`.trim().replace(/\\n/g, "\n");
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s*,\s*/)
    .map((entry) => parseRawBerEntry(entry))
    .filter((entry) => entry.length > 0);
}

export const opticalRawBerTemplate = (context: any) => {
  const row = (context?.item && context.item.data) || {};
  const entries = formatRawBerEntries(
    row.opticalRawBer ?? row["Optical RawBer"] ?? row.raw_ber ?? row.rawBer
  );

  if (entries.length === 0) {
    return <div class="raw-ber-cell-empty">Not Available</div>;
  }

  return (
    <div class="raw-ber-cell">
      {entries.map((entry, entryIndex) => (
        <div class="raw-ber-entry" key={`raw-ber-entry-${entryIndex}`}>
          {entry.map((token, tokenIndex) => {
            const isStatusToken = token.key.trim().toLowerCase() === "status";
            const valueClass = isStatusToken
              ? getRawBerStatusClass(token.value)
              : "raw-ber-token-value";
            return [
              <span class="raw-ber-token-key" key={`raw-ber-key-${entryIndex}-${tokenIndex}`}>
                {token.key}:
              </span>,
              <span
                class={valueClass}
                key={`raw-ber-value-${entryIndex}-${tokenIndex}`}
              >
                {token.value}
              </span>,
            ];
          })}
        </div>
      ))}
    </div>
  );
};

function formatRxPowerValue(rawValue: unknown): string {
  const value = `${rawValue ?? ""}`.trim().replace(/\\n/g, "\n");
  if (!value) {
    return "";
  }

  return value
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\s*;\s*/g, "\n")
    .replace(/\s*,\s*/g, "\n")
    .replace(/,\s*(?=channel\.)/gi, "\n")
    .replace(/\s+(?=channel\.\d+\.input_power\.instant:)/gi, "\n");
}

const createPowerValueTemplate = (field: "txPower" | "rxPower") => (context: any) => {
  const row = (context?.item && context.item.data) || {};
  const value = formatRxPowerValue(row[field]);
  if (!value) {
    return (
      <div class="gpu-multiline-value-cell">
        <span class="oj-text-color-success" aria-label={`${field} empty`}>
          ✓
        </span>
      </div>
    );
  }
  return <div class="gpu-multiline-value-cell">{value}</div>;
};

export const txPowerTemplate = createPowerValueTemplate("txPower");
export const rxPowerTemplate = createPowerValueTemplate("rxPower");

export const relativeTimestampTemplate = (context: any) => {
  const row = (context?.item && context.item.data) || {};
  const rawValue = `${row["Last Executed"] ?? row.lastExecuted ?? ""}`.trim();
  const formattedValue = formatValidationTimestamp(rawValue || null);
  return <span title={rawValue || formattedValue}>{formattedValue}</span>;
};

const renderGpuMultilineValue = (value: unknown) => {
  const text = formatLocationValue(value).replace(/\\n/g, "\n") || "Not Available";
  return <div class="gpu-multiline-value-cell">{text}</div>;
};

const createGpuMultilineValueTemplate = (field: string) => (context: any) => {
  const row = (context?.item && context.item.data) || {};
  return renderGpuMultilineValue(row[field]);
};

type RackLocation = {
  building?: unknown;
  number?: unknown;
  elevation?: unknown;
  rackNumber?: unknown;
  rackElevation?: unknown;
};

function normalizeMissingValue(value: unknown): string {
  const normalized = `${value ?? ""}`.trim();
  if (normalized === "") {
    return "missing";
  }

  const lowered = normalized.toLowerCase();
  if (lowered === "unknown" || lowered === "no data" || lowered === "missing") {
    return "missing";
  }

  return normalized;
}

function parseDelimitedLocationValue(rawLocation: string): RackLocation | null {
  const pairs = rawLocation
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        return null;
      }

      const key = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      return key === "" ? null : [key, value] as const;
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry));

  if (pairs.length === 0) {
    return null;
  }

  const parsed: RackLocation = {};
  pairs.forEach(([key, value]) => {
    if (key === "building") parsed.building = value;
    if (key === "racknumber" || key === "number") parsed.rackNumber = value;
    if (key === "rackelevation" || key === "elevation") parsed.rackElevation = value;
  });

  if (
    parsed.building === undefined &&
    parsed.rackNumber === undefined &&
    parsed.rackElevation === undefined
  ) {
    return null;
  }

  return parsed;
}

function formatLocationValue(rawLocation: unknown): string {
  const normalized = `${rawLocation ?? ""}`.trim();
  if (normalized === "") {
    return "missing";
  }

  const lowered = normalized.toLowerCase();
  if (lowered === "unknown" || lowered === "no data" || lowered === "missing") {
    return "missing";
  }

  try {
    const parsed = JSON.parse(normalized) as RackLocation;
    return [
      normalizeMissingValue(parsed?.building),
      normalizeMissingValue(parsed?.rackNumber ?? parsed?.number),
      normalizeMissingValue(parsed?.rackElevation ?? parsed?.elevation),
    ].join(":");
  } catch {
    const parsed = parseDelimitedLocationValue(normalized);
    if (!parsed) {
      return normalized;
    }

    return [
      normalizeMissingValue(parsed?.building),
      normalizeMissingValue(parsed?.rackNumber ?? parsed?.number),
      normalizeMissingValue(parsed?.rackElevation ?? parsed?.elevation),
    ].join(":");
  }
}

function mapGpuComputePortToNicLabel(rawPort: string): string | null {
  const match = rawPort.match(/^slot(\d+)\/port(\d+)-(\d+)$/i);
  if (!match) {
    return null;
  }

  const slot = Number(match[1]);
  const portGroup = Number(match[2]);
  const lane = Number(match[3]);
  if (!Number.isFinite(slot) || !Number.isFinite(portGroup) || !Number.isFinite(lane)) {
    return null;
  }

  const mpoSuffixByLane: Record<number, string> = {
    1: "left.1",
    2: "left.2",
    3: "right.1",
    4: "right.2",
  };
  const mpoSuffix = mpoSuffixByLane[lane];
  if (!mpoSuffix) {
    return null;
  }

  const nicNumber = (slot - 1) * 2 + portGroup;
  if (nicNumber < 1) {
    return null;
  }

  return `NIC${nicNumber}.MPO-${mpoSuffix}`;
}

function buildGpuLldpDetailParts(
  location: unknown,
  port: unknown,
  name: unknown,
  mapPortLabel: boolean = false
): string[] {
  const portValue = normalizeMissingValue(port);
  const mappedPortValue = mapPortLabel ? mapGpuComputePortToNicLabel(portValue) || portValue : portValue;
  return [
    formatLocationValue(location),
    mappedPortValue,
    `${normalizeMissingValue(name)}:${portValue}`,
  ];
}

type HighlightSegment = {
  text: string;
  highlight?: boolean;
};

type DetailPartRender = {
  prefix?: string;
  suffix?: string;
  segments: HighlightSegment[];
};

function isMissingLikeValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "[missing]"
    || normalized === "missing"
    || normalized === "missing:missing";
}

function splitPreservingDelimiters(value: string): string[] {
  return value.split(/([:\/\.\-_\s]+)/).filter((part) => part !== "");
}

function commonPrefixLength(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;
  while (index < maxLength && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixLength(left: string, right: string, prefixLength: number): number {
  const maxLength = Math.min(left.length, right.length) - prefixLength;
  let index = 0;
  while (
    index < maxLength
    && left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1;
  }
  return index;
}

function createPlainRenderPart(value: string, prefix = "", suffix = ""): DetailPartRender {
  return {
    prefix,
    suffix,
    segments: [{ text: value }],
  };
}

function createHighlightedRenderPart(value: string, prefix = "", suffix = ""): DetailPartRender {
  return {
    prefix,
    suffix,
    segments: [{ text: value, highlight: true }],
  };
}

function buildDiffSegments(expectedValue: string, observedValue: string): [HighlightSegment[], HighlightSegment[]] {
  if (expectedValue === observedValue) {
    return [
      [{ text: expectedValue }],
      [{ text: observedValue }],
    ];
  }

  const expectedTokens = splitPreservingDelimiters(expectedValue);
  const observedTokens = splitPreservingDelimiters(observedValue);
  const isSameShape = expectedTokens.length === observedTokens.length;

  if (isSameShape) {
    const differingTokenIndexes = expectedTokens.reduce<number[]>((indexes, token, index) => {
      if (token !== observedTokens[index]) {
        indexes.push(index);
      }
      return indexes;
    }, []);

    if (differingTokenIndexes.length > 0) {
      return [
        expectedTokens.map((token, index) => ({
          text: token,
          highlight: differingTokenIndexes.includes(index),
        })),
        observedTokens.map((token, index) => ({
          text: token,
          highlight: differingTokenIndexes.includes(index),
        })),
      ];
    }
  }

  const prefixLength = commonPrefixLength(expectedValue, observedValue);
  const suffixLength = commonSuffixLength(expectedValue, observedValue, prefixLength);
  const expectedDiffEnd = expectedValue.length - suffixLength;
  const observedDiffEnd = observedValue.length - suffixLength;

  return [
    [
      ...(prefixLength > 0 ? [{ text: expectedValue.slice(0, prefixLength) }] : []),
      {
        text: expectedValue.slice(prefixLength, expectedDiffEnd) || expectedValue,
        highlight: true,
      },
      ...(suffixLength > 0 ? [{ text: expectedValue.slice(expectedDiffEnd) }] : []),
    ],
    [
      ...(prefixLength > 0 ? [{ text: observedValue.slice(0, prefixLength) }] : []),
      {
        text: observedValue.slice(prefixLength, observedDiffEnd) || observedValue,
        highlight: true,
      },
      ...(suffixLength > 0 ? [{ text: observedValue.slice(observedDiffEnd) }] : []),
    ],
  ];
}

function buildComparableRenderParts(
  expectedParts: string[],
  observedParts: string[],
): [DetailPartRender[], DetailPartRender[]] {
  return expectedParts.map((expectedValue, index) => {
    const observedValue = observedParts[index] ?? "missing";
    const prefix = index < 2 ? "[" : "";
    const suffix = index < 2 ? "]" : "";
    const expectedMissing = isMissingLikeValue(expectedValue);
    const observedMissing = isMissingLikeValue(observedValue);

    if (expectedMissing && observedMissing) {
      return [
        createPlainRenderPart(expectedValue, prefix, suffix),
        createPlainRenderPart(observedValue, prefix, suffix),
      ] as const;
    }

    if (expectedMissing) {
      return [
        createPlainRenderPart(expectedValue, prefix, suffix),
        createHighlightedRenderPart(observedValue, prefix, suffix),
      ] as const;
    }

    if (observedMissing) {
      return [
        createHighlightedRenderPart(expectedValue, prefix, suffix),
        createPlainRenderPart(observedValue, prefix, suffix),
      ] as const;
    }

    const [expectedSegments, observedSegments] = buildDiffSegments(expectedValue, observedValue);
    return [
      { prefix, suffix, segments: expectedSegments },
      { prefix, suffix, segments: observedSegments },
    ] as const;
  }).reduce<[DetailPartRender[], DetailPartRender[]]>(
    (accumulator, [expectedPart, observedPart]) => {
      accumulator[0].push(expectedPart);
      accumulator[1].push(observedPart);
      return accumulator;
    },
    [[], []],
  );
}

function renderDetailPart(part: DetailPartRender, key: string) {
  return (
    <span class="gpu-lldp-error-details-part" key={key}>
      {part.prefix ?? ""}
      {part.segments.map((segment, segmentIndex) => (
        <span
          class={segment.highlight ? "gpu-lldp-diff-highlight" : undefined}
          key={`${key}-segment-${segmentIndex}`}
        >
          {segment.text}
        </span>
      ))}
      {part.suffix ?? ""}
    </span>
  );
}

export const deviceALocationTemplate = createGpuMultilineValueTemplate("deviceALocation");
export const currentBLocationTemplate = createGpuMultilineValueTemplate("currentBLocation");
export const expectedBLocationTemplate = createGpuMultilineValueTemplate("expectedBLocation");
export const sourceDeviceLocationTemplate = createGpuMultilineValueTemplate("sourceDeviceLocation");

export const gpuMultilineErrorMessageTemplate = (context: any) => {
  const row = (context?.item && context.item.data) || {};
  const value = `${row.errorMessage ?? ""}`.trim().replace(/\\n/g, "\n") || "Not Available";
  return <div class="gpu-multiline-error-message-cell">{value}</div>;
};

export const errorMessageClampTemplate = (context: any) => {
  const row = (context?.item && context.item.data) || {};
  const value = `${row.errorMessage ?? ""}`.trim() || "Not Available";
  return (
    <div class="fec-ber-error-clamp" title={value}>
      {value}
    </div>
  );
};

export const gpuLldpErrorDetailsTemplate = (context: any) => {
  const row = (context?.item && context.item.data) || {};
  const interfaceParts = buildGpuLldpDetailParts(row.deviceALocation, row.deviceAPort, row.deviceAName);
  const expectedParts = buildGpuLldpDetailParts(
    row.expectedBLocation,
    row.expectedDeviceBPort,
    row.expectedDeviceBName,
    true
  );
  const observedParts = buildGpuLldpDetailParts(
    row.currentBLocation,
    row.currentDeviceBPort,
    row.currentDeviceBName,
    true
  );
  const [expectedRenderParts, observedRenderParts] = buildComparableRenderParts(expectedParts, observedParts);
  const detailRows = [
    {
      label: "Interface:",
      parts: interfaceParts.map((part, index) => createPlainRenderPart(part, index < 2 ? "[" : "", index < 2 ? "]" : "")),
    },
    {
      label: "Expected remote:",
      parts: expectedRenderParts,
    },
    {
      label: "Observed remote:",
      parts: observedRenderParts,
    },
  ];

  return (
    <div class="gpu-lldp-error-details-cell">
      {detailRows.flatMap((detailRow, rowIndex) => [
        <span class="gpu-lldp-error-details-label" key={`${rowIndex}-label`}>
          {detailRow.label}
        </span>,
        ...detailRow.parts.map((part, partIndex) => renderDetailPart(part, `${rowIndex}-${partIndex}`)),
      ]
      )}
    </div>
  );
};
