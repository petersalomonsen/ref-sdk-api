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
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
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
  };
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
  requests: any[]
) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "A1:Z",
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

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
              ? { type: "CURRENCY", pattern: "$#,##0.00" }
              : { type: "NUMBER", pattern: "#,##0" },
        },
      },
      fields: "userEnteredFormat.numberFormat",
    },
  };
}

export async function updateReportSheet(reportData: any[]) {
  const sheets = await authenticateGoogleSheets();
  const spreadsheetId = "1XtAWMXAeMUEo74ZtSclq1krERQPmyNztmHj3j9obsY4";
  reportData = reportData.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const reportLength = reportData.length + 1;
  const sheetId = 0;
  const values = [
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

  const requests = [
    formatHeader(sheetId),
    formatTotalRow(sheetId, reportLength),
    // Format NEAR to Other FTs as numbers
    ...Array.from({ length: 4 }, (_, i) =>
      formatColumnNumber(sheetId, 1, reportLength, 5 + i, "NUMBER")
    ),
    // Format DAO/Lockup/Total Assets as USD
    ...Array.from({ length: 3 }, (_, i) =>
      formatColumnNumber(sheetId, 1, reportLength, 9 + i, "CURRENCY")
    ),
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId: sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: 10,
        },
      },
    },
  ];

  await updateSheet(sheets, spreadsheetId, values, requests);
}

export async function updateTransactionsReportSheet(reportData: any[]) {
  const sheets = await authenticateGoogleSheets();
  const spreadsheetId = "1XtAWMXAeMUEo74ZtSclq1krERQPmyNztmHj3j9obsY4";
  const sheetId = 0;
  const reportLength = reportData.length + 1;

  const values = [
    [
      "Treasury URL",
      "Payment Proposals",
      "Tokens Paid",
      "Tokens Paid Value (USD)",
      "Asset Exchange Proposals",
      "Tokens Exchanged",
      "Asset Exchange Value (USD)",
      "Stake Proposals",
      "Staked Amount (NEAR)",
      "Staked Value (USD)",
      "Lockup Proposals",
      "Lockup Amount (NEAR)",
      "Lockup Value (USD)",
    ],
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

  try {
    // Clear all content & formatting
    await clearSheet(sheets, spreadsheetId, sheetId);

    // Write values
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "A1:Z",
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    // Prepare formatting requests
    const requests: any[] = [
      formatHeader(sheetId),
      formatTotalRow(sheetId, reportLength),
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
      // Format TOTAL row's numbers
      ...[
        { col: 1, type: "NUMBER" },
        { col: 3, type: "NUMBER" },
        { col: 7, type: "NUMBER" },
        { col: 9, type: "NUMBER" },
        { col: 11, type: "NUMBER" },
        { col: 2, type: "CURRENCY" },
        { col: 6, type: "CURRENCY" },
        { col: 8, type: "CURRENCY" },
        { col: 12, type: "CURRENCY" },
      ].map(({ col, type }) =>
        formatColumnNumber(sheetId, reportLength, reportLength + 1, col, type)
      ),
    ];

    // Apply formatting
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });

    console.log("✅ Transactions sheet updated successfully!");
  } catch (error) {
    console.error("❌ Failed to update transactions sheet:", error);
  }
}
