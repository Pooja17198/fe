import * as XLSX from "xlsx";
import { downloadWorkbook, sheetFromRows } from "../rack/excelDownloadUtil";
import { DEPLOYMENT_GROUP_ERROR_TYPE_DEFINITIONS } from "./deploymentGroupErrorTypes";
import { summarizeDeploymentGroupRows } from "./summary";
import type { DeploymentGroupRackRow } from "./types";

const EXPORT_FILENAME_PREFIX = "deployment_group_validation";

export async function downloadDeploymentGroupExcel(params: {
  building: string;
  deploymentGroup: string;
  rows: DeploymentGroupRackRow[];
}): Promise<void> {
  const breakdownRows = buildBreakdownSheetRows(params.rows);
  const summaryRows = buildSummarySheetRows(params.rows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(summaryRows), "Summary");
  XLSX.utils.book_append_sheet(workbook, sheetFromRows(breakdownRows), "Error Breakdown");

  const fileName = [
    EXPORT_FILENAME_PREFIX,
    sanitizeFileNameSegment(params.building),
    sanitizeFileNameSegment(params.deploymentGroup),
  ].join("_") + ".xlsx";

  downloadWorkbook(workbook, fileName);
}

function buildSummarySheetRows(rows: DeploymentGroupRackRow[]): string[][] {
  const aggregate = summarizeDeploymentGroupRows(rows).aggregate;
  const summaryRows: string[][] = [["Error Type", "Count"]];

  DEPLOYMENT_GROUP_ERROR_TYPE_DEFINITIONS.forEach((definition) => {
    summaryRows.push([definition.label, String(definition.getCount(aggregate))]);
  });

  return summaryRows;
}

function buildBreakdownSheetRows(rows: DeploymentGroupRackRow[]): string[][] {
  return [
    [
      "Rack Location",
      "Rack Serial Number",
      ...DEPLOYMENT_GROUP_ERROR_TYPE_DEFINITIONS.map((definition) => definition.label),
    ],
    ...rows.map((row) => buildRackBreakdownRow(row)),
  ];
}

function buildRackBreakdownRow(row: DeploymentGroupRackRow): string[] {
  return [
    row.rackLocation,
    row.rackSerialNumber,
    ...DEPLOYMENT_GROUP_ERROR_TYPE_DEFINITIONS.map((definition) =>
      String(definition.getCount(row.summary))
    ),
  ];
}

function sanitizeFileNameSegment(value: string): string {
  const normalized = String(value || "").trim().replace(/[^a-z0-9_-]+/gi, "_");
  return normalized || "unknown";
}
