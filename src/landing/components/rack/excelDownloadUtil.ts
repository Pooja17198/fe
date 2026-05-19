import * as XLSX from "xlsx";

export type ExcelCellValue = string | number | boolean | null | undefined;
export type ExcelRows = ExcelCellValue[][];

export function sheetFromRows(rows: ExcelRows): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const columnWidths = getColumnWidths(rows);
  if (columnWidths.length > 0) {
    (sheet as XLSX.WorkSheet & { "!cols"?: Array<{ wch: number }> })["!cols"] = columnWidths;
  }
  return sheet;
}

export function downloadWorkbook(workbook: XLSX.WorkBook, fileName: string): void {
  const excelBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  const fileData = new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const objectUrl = URL.createObjectURL(fileData);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function getColumnWidths(rows: ExcelRows): Array<{ wch: number }> {
  const widths: number[] = [];

  rows.forEach((row) => {
    row.forEach((value, index) => {
      const lines = String(value || "").split("\n");
      const longestLine = lines.reduce((maxLength, line) => Math.max(maxLength, line.length), 0);
      widths[index] = Math.min(Math.max(widths[index] || 10, longestLine + 2), 60);
    });
  });

  return widths.map((width) => ({ wch: width || 10 }));
}
