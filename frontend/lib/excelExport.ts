/**
 * Excel Export Utility
 * Converts data to CSV and triggers download
 */

export function exportToExcel(
  data: Array<Record<string, any>>,
  filename: string = "export",
) {
  if (!data || data.length === 0) {
    alert("No data to export");
    return;
  }

  // Get headers from first row
  const headers = Object.keys(data[0]);

  // Convert data to CSV
  const csv = [
    headers.map((h) => `"${h}"`).join(","), // Header row
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          // Escape quotes and wrap in quotes if contains comma or newline
          const stringValue =
            value === null || value === undefined ? "" : String(value);
          return `"${stringValue.replace(/"/g, '""')}"`;
        })
        .join(","),
    ),
  ].join("\n");

  // Create blob and download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export to actual Excel format (.xlsx)
 * This requires a library like xlsx - fallback to CSV for now
 */
export async function exportToXLSX(
  data: Array<Record<string, any>>,
  filename: string = "export",
) {
  // For now, use CSV export
  // In production, integrate a library like 'xlsx' or 'exceljs'
  exportToExcel(data, filename);
}
