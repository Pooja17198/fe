import { h } from "preact";

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
  const value = `${row.status ?? row.lockStatus ?? ""}`.trim().toLowerCase();
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
  return <span>{row.status ?? row.lockStatus ?? "-"}</span>;
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

function formatRxPowerValue(rawValue: unknown): string {
  const value = `${rawValue ?? ""}`.trim().replace(/\\n/g, "\n");
  if (!value) {
    return "Not Available";
  }

  return value
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\s*;\s*/g, "\n")
    .replace(/,\s*(?=channel\.)/gi, "\n")
    .replace(/\s+(?=channel\.\d+\.input_power\.instant:)/gi, "\n");
}

export const rxPowerTemplate = (context: any) => {
  const row = (context?.item && context.item.data) || {};
  const value = formatRxPowerValue(row.rxPower);
  return <div class="gpu-multiline-value-cell">{value}</div>;
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

function buildGpuLldpDetailParts(location: unknown, port: unknown, name: unknown): string[] {
  const portValue = normalizeMissingValue(port);
  return [
    formatLocationValue(location),
    portValue,
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
  return value.trim().toLowerCase() === "missing";
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

function buildLastTerminalValueSegments(value: string): HighlightSegment[] {
  const missingSplitMatch = value.match(/^(.*?)(missing)(:missing)?$/i);
  if (missingSplitMatch) {
    const [, leadingText] = missingSplitMatch;
    return leadingText ? [{ text: leadingText }] : [{ text: value }];
  }

  const match = value.match(/^(.*?)(\d+)$/);
  if (!match) {
    return [{ text: value }];
  }

  const [, leadingText, trailingValue] = match;
  return [
    ...(leadingText ? [{ text: leadingText }] : []),
    { text: trailingValue, highlight: true },
  ];
}

function createMissingAwareRenderPart(value: string, prefix = "", suffix = ""): DetailPartRender {
  if (isMissingLikeValue(value)) {
    return createPlainRenderPart(value, prefix, suffix);
  }

  return {
    prefix,
    suffix,
    segments: buildLastTerminalValueSegments(value),
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

    if (expectedMissing || observedMissing) {
      return [
        createMissingAwareRenderPart(expectedValue, prefix, suffix),
        createMissingAwareRenderPart(observedValue, prefix, suffix),
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
  const expectedParts = buildGpuLldpDetailParts(row.expectedBLocation, row.expectedDeviceBPort, row.expectedDeviceBName);
  const observedParts = buildGpuLldpDetailParts(row.currentBLocation, row.currentDeviceBPort, row.currentDeviceBName);
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
