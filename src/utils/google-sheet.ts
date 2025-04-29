import { google } from "googleapis";
import * as path from "path";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const CREDS_PATH = path.join(__dirname, "./near-treasury-metrics.json");

async function authenticateGoogleSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDS_PATH,
    scopes: SCOPES,
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client as any });

  return sheets;
}

export async function updateSheet(reportData: any[]) {
  const sheets = await authenticateGoogleSheets();
  const spreadsheetId = "1fGv-s8n223_tJugjBZm2Yp7DQpjBccqc3X21Dgedj-I";

  const values = [
    [
      "Customer Name",
      "Treasury URL",
      "Lockup Account",
      "Dao Assets (USD)",
      "Lockup Assets (USD)",
      "Total Assets (USD)",
      "Users",
    ],
    ...reportData.map((row) => [
      row.customerName,
      row.treasuryUrl,
      row.lockupContract,
      row.daoAssetsValueUSD,
      row.lockupValueUSD,
      row.totalAssetsValueUSD,
      row.numberOfUsers,
    ]),
    [
      "TOTAL",
      reportData.length + " treasuries",
      "",
      `=SUM(D2:D${reportData.length + 1})`,
      `=SUM(E2:E${reportData.length + 1})`,
      `=SUM(F2:F${reportData.length + 1})`,
      "",
    ],
  ];

  try {
    // 1. Write the values
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "A1:H",
      valueInputOption: "RAW",
      requestBody: { values },
    });

    // 2. Format the sheet
    const requests = [
      // Bold + wrap header (first row)
      {
        repeatCell: {
          range: {
            sheetId: 0,
            startRowIndex: 0, // Only header row
            endRowIndex: 1, // End of header row
          },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              wrapStrategy: "WRAP",
            },
          },
          fields: "userEnteredFormat(textFormat,wrapStrategy)",
        },
      },

      // Bold + wrap TOTAL row (last row)
      {
        repeatCell: {
          range: {
            sheetId: 0,
            startRowIndex: reportData.length + 1, // Total row starts here
            endRowIndex: reportData.length + 2, // Total row ends here
          },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true }, // Apply bold to TOTAL row
              wrapStrategy: "WRAP", // Optional: Wrap text
            },
          },
          fields: "userEnteredFormat(textFormat,wrapStrategy)",
        },
      },

      // Currency formatting for USD columns (D, E, F)
      {
        repeatCell: {
          range: {
            sheetId: 0,
            startColumnIndex: 3, // D (Dao Assets column)
            endColumnIndex: 6, // F (Total Assets column, included)
            startRowIndex: 1, // Start from row 1 (skip header)
            endRowIndex: reportData.length + 2, // Include the total row
          },
          cell: {
            userEnteredFormat: {
              numberFormat: {
                type: "CURRENCY",
                pattern: "$#,##0.00",
              },
            },
          },
          fields: "userEnteredFormat.numberFormat",
        },
      },

      // Auto-resize columns A–G
      {
        autoResizeDimensions: {
          dimensions: {
            sheetId: 0,
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: 8, // Include column H for the "Users" column
          },
        },
      },
    ];

    // Apply the formatting
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });

    console.log("✅ Sheet updated with formatting and total!");
  } catch (error) {
    console.error("❌ Error updating sheet:", error);
  }
}
