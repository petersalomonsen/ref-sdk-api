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
  return google.sheets({ version: "v4", auth: client as any });
}

function generateSumFormulasFromLetters(
  reportLength: number,
  columns: string[]
) {
  return columns.map((col) =>
    col ? `=SUM(${col}2:${col}${reportLength})` : ""
  );
}

async function clearSheet(sheets: any, spreadsheetId: string, sheetId: number) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateCells: {
            range: {
              sheetId,
            },
            rows: [], // This removes all rows
            fields: "*",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
            },
            cell: {
              userEnteredValue: null,
              userEnteredFormat: {},
            },
            fields: "userEnteredValue,userEnteredFormat",
          },
        },
      ],
    },
  });
}

function formatHeader(sheetId: number) {
  return [
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, italic: true },
            horizontalAlignment: "LEFT",
            verticalAlignment: "MIDDLE",
          },
        },
        fields:
          "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
          },
        },
        fields:
          "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)",
      },
    },
  ];
}

function formatTotalRow(sheetId: number, rowIndex: number) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1 },
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true },
          horizontalAlignment: "RIGHT",
          verticalAlignment: "MIDDLE",
        },
      },
      fields:
        "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)",
    },
  };
}

async function updateSheet(
  sheets: any,
  spreadsheetId: string,
  values: any[][],
  requests: any[],
  sheetTitle: string
) {
  // Write values to the specific sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetTitle}'!A1:Z`, // Specify the sheet by title
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  // Apply formatting
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

function formatColumnNumber(
  sheetId: number,
  rowStart: number,
  rowEnd: number,
  col: number,
  type: string
): any {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: rowStart,
        endRowIndex: rowEnd,
        startColumnIndex: col,
        endColumnIndex: col + 1,
      },
      cell: {
        userEnteredFormat: {
          numberFormat:
            type === "CURRENCY"
              ? { type: "CURRENCY", pattern: "$#,##0.00" } // US currency
              : { type: "NUMBER", pattern: "#,##0" }, // Standard number
        },
      },
      fields: "userEnteredFormat.numberFormat",
    },
  };
}

async function getOrCreateSheetByTitle(
  sheets: any,
  spreadsheetId: string,
  title: string
): Promise<number> {
  const { data } = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheet = data.sheets?.find(
    (s: any) => s.properties?.title === title
  );

  if (existingSheet) return existingSheet.properties.sheetId;

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });

  return response.data.replies?.[0].addSheet?.properties?.sheetId;
}

export async function updateReportSheet(reportData: any[]) {
  const sheets = await authenticateGoogleSheets();
  const spreadsheetId = "1XtAWMXAeMUEo74ZtSclq1krERQPmyNztmHj3j9obsY4";

  // Sort data by createdAt
  reportData = reportData.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const reportLength = reportData.length + 2; // Add 2 because of timestamp and header row

  // Format timestamp
  const now = new Date();
  const timestamp = `Report generated on: ${now.toLocaleString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC", // Set to UTC time zone
  })} UTC`;

  // Generate sheet title like "May 2025"
  const sheetTitle =
    now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    }) + " Metrics Report";

  // Add timestamp row, headers, and data
  const values = [
    [timestamp],
    [
      "Created At",
      "Created By",
      "Treasury URL",
      "Lockup Account",
      "DAO Users",
      "NEAR",
      "USDC",
      "USDt",
      "Other FTs",
      "DAO Assets (USD)",
      "Lockup Assets (USD)",
      "Total Assets (USD)",
    ],
    ...reportData.map((row) => [
      row.createdAt,
      row.createdBy,
      row.treasuryUrl,
      row.lockupContract,
      row.numberOfUsers,
      row.nearAmount,
      row.usdcAmount,
      row.usdtAmount,
      row.otherAmount,
      row.daoAssetsValueUSD,
      row.lockupValueUSD,
      row.totalAssetsValueUSD,
    ]),
    [
      "TOTAL",
      "",
      `${reportData.length} treasuries`,
      "",
      "",
      ...generateSumFormulasFromLetters(reportLength, [
        "F",
        "G",
        "H",
        "I",
        "J",
        "K",
        "L",
      ]),
    ],
  ];

  // Create or get the monthly sheet
  const sheetId = await getOrCreateSheetByTitle(
    sheets,
    spreadsheetId,
    sheetTitle
  );

  const requests = [
    ...formatHeader(sheetId), // now returns an array
    formatTotalRow(sheetId, reportLength),
    // Format NEAR to Other FTs as numbers
    ...Array.from({ length: 4 }, (_, i) =>
      formatColumnNumber(sheetId, 2, reportLength, 5 + i, "NUMBER")
    ),

    // Format DAO/Lockup/Total Assets as USD
    ...Array.from({ length: 3 }, (_, i) =>
      formatColumnNumber(sheetId, 2, reportLength, 9 + i, "CURRENCY")
    ),
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: 12,
        },
      },
    },
  ];

  await updateSheet(sheets, spreadsheetId, values, requests, sheetTitle);
}

export async function updateTransactionsReportSheet(reportData: any[]) {
  const sheets = await authenticateGoogleSheets();
  const spreadsheetId = "1XtAWMXAeMUEo74ZtSclq1krERQPmyNztmHj3j9obsY4";

  // Timestamp (UTC)
  const now = new Date();
  const timestamp = `Report generated on: ${now.toLocaleString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  })} UTC`;

  // Sheet title like "May 2025 Txn Report"
  const sheetTitle =
    now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    }) + " Txn Report";

  // Create or get sheet
  const sheetId = await getOrCreateSheetByTitle(
    sheets,
    spreadsheetId,
    sheetTitle
  );

  const reportLength = reportData.length + 3; // +1 timestamp, +1 category header, +1 column header

  // Data values
  const values = [
    [timestamp], // Row 0
    [
      "", // Column A
      "Payment Metrics",
      "",
      "",
      "Exchange Metrics",
      "",
      "",
      "Stake Metrics",
      "",
      "",
      "Lockup Metrics",
      "",
      "",
    ], // Row 1: Category headers
    [
      "Treasury URL",
      "Payment Proposals",
      "Tokens Paid",
      "Tokens Paid Value (USD)",
      "Asset Exchange Proposals",
      "Tokens Exchanged",
      "Asset Exchange Value (USD)",
      "Stake Delegation Proposals",
      "Amount (NEAR)",
      "Value (USD)",
      "Lockup Proposals",
      "Lockup Amount (NEAR)",
      "Lockup Value (USD)",
    ], // Row 2: Column headers
    ...reportData.map((row) => [
      row.treasuryUrl,
      row.paymentProposals,
      row.paymentTokens,
      row.totalPaymentValue,
      row.exchangeProposals,
      row.exchangeTokens,
      row.totalExchangeValue,
      row.stakeProposals,
      row.totalStaked,
      row.totalStakedUSD,
      row.lockupProposals,
      row.totalLockupNear,
      row.totalLockedValueUSD,
    ]),
    [
      "TOTAL",
      ...generateSumFormulasFromLetters(reportLength, [
        "B",
        "",
        "D",
        "E",
        "",
        "G",
        "H",
        "I",
        "J",
        "K",
        "L",
        "M",
      ]),
    ],
  ];

  // Prepare formatting requests
  const requests: any[] = [
    ...formatHeader(sheetId),
    formatTotalRow(sheetId, reportLength),

    // Merge group headers (row 1)
    {
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 1,
          endColumnIndex: 4,
        },
        mergeType: "MERGE_ALL",
      },
    },
    {
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 4,
          endColumnIndex: 7,
        },
        mergeType: "MERGE_ALL",
      },
    },
    {
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 7,
          endColumnIndex: 10,
        },
        mergeType: "MERGE_ALL",
      },
    },
    {
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 10,
          endColumnIndex: 13,
        },
        mergeType: "MERGE_ALL",
      },
    },

    // Format category header row
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            horizontalAlignment: "CENTER",
            backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
          },
        },
        fields:
          "userEnteredFormat(textFormat,horizontalAlignment,backgroundColor)",
      },
    },

    // Format all metrics columns: number or currency
    ...[
      { col: 2, type: "NUMBER" },
      { col: 5, type: "NUMBER" },
      { col: 8, type: "NUMBER" },
      { col: 9, type: "NUMBER" },
      { col: 11, type: "NUMBER" },
      { col: 12, type: "NUMBER" },
      { col: 4, type: "CURRENCY" },
      { col: 7, type: "CURRENCY" },
      { col: 10, type: "CURRENCY" },
      { col: 13, type: "CURRENCY" },
    ].map(({ col, type }) =>
      formatColumnNumber(sheetId, 3, reportLength, col - 1, type)
    ),

    // Auto-resize columns
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: 13,
        },
      },
    },
  ];

  try {
    await clearSheet(sheets, spreadsheetId, sheetId);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetTitle}'!A1:Z`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });

    console.log(`✅ Sheet "${sheetTitle}" updated successfully!`);
  } catch (error) {
    console.error(`❌ Failed to update "${sheetTitle}" sheet:`, error);
  }
}
