import { h } from "preact";

/**
 * Oracle JET template renderers must be functions that accept a context and return a VNode.
 * These are used via <template slot="..." render={...} /> on oj-table.
 */

export const lldpTemplate = (context: any) => {
  const row = (context?.item && context.item.data) || {};
  const value: string = (row.lldpStatus || "").toString();
  const isMatch = value.toLowerCase() === "match";
  const isMismatch = value.toLowerCase() === "mismatch";
  const colorClass = isMatch ? "oj-text-color-success" : isMismatch ? "oj-text-color-danger" : "";
  return <span class={colorClass}>{value}</span>;
};

export const psuTemplate = (context: any) => {
  const row = (context?.item && context.item.data) || {};
  const hasFailure =
    row.psuFailure !== null &&
    row.psuFailure !== undefined &&
    `${row.psuFailure}`.toLowerCase() !== "null" &&
    `${row.psuFailure}` !== "";
  return hasFailure ? (
    <span class="oj-text-color-danger" aria-label="PSU failure">
      ✗
    </span>
  ) : (
    <span class="oj-text-color-success" aria-label="No PSU failure">
      ✓
    </span>
  );
};
