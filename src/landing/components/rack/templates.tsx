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