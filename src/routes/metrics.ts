import express, { Request, Response } from "express";
import axios from "axios";
import prisma from "../prisma";
import { updateSheet } from "../utils/google-sheet";
import { fetchFromRPC } from "../utils/fetch-from-rpc";
import Big from "big.js";
import { sha256 } from "js-sha256";

const router = express.Router();
const factoryAccount = "treasury-factory.near";

type TreasuryReportRow = {
  customerName: string;
  treasuryUrl: string;
  totalAssetsValueUSD: number;
  numberOfUsers: number;
  monthlyTransactions: number;
  daoAssetsValueUSD: number;
  lockupContract: string;
  lockupValueUSD: number;
};

function accountToLockup(accountId: string) {
  return `${sha256(accountId).slice(0, 40)}.lockup.near`;
}

async function insertTreasuryToDb({
  createdAt,
  createdBy,
  instanceAccount,
  daoAccount,
  name,
}: {
  createdAt: Date;
  createdBy: string;
  instanceAccount: string;
  daoAccount: string;
  name: string;
}) {
  let lockupContract = accountToLockup(daoAccount);
  const resp = await fetchFromRPC(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "view_account",
        finality: "final",
        account_id: lockupContract,
      },
    },
    false
  );

  if (!resp?.result?.amount) {
    lockupContract = "";
  }

  await prisma.treasury.upsert({
    where: { name },
    update: {
      createdAt,
      createdBy,
      instanceAccount,
      daoAccount,
      lockupContract,
    },
    create: {
      name,
      createdAt,
      createdBy,
      instanceAccount,
      daoAccount,
      lockupContract,
    },
  });
}

const fetchNearBalances = async (account_id: string) => {
  try {
    const { data } = await axios.get(
      `https://ref-sdk-test-cold-haze-1300-2.fly.dev/api/all-token-balance-history`,
      {
        params: { account_id, token_id: "near" },
      }
    );
    return data;
  } catch (error) {
    console.error(`Error fetching balance for ${account_id}`, error);
    return null;
  }
};

const fetchFTBalances = async (account_id: string) => {
  try {
    const { data } = await axios.get(
      `https://ref-sdk-test-cold-haze-1300-2.fly.dev/api/ft-tokens`,
      {
        params: { account_id },
      }
    );
    return data;
  } catch (error) {
    console.error(`Error fetching balance for ${account_id}`, error);
    return null;
  }
};

router.get("/db/store-treasuries", async (_req, res) => {
  try {
    const { data } = await axios.get(
      `https://api.nearblocks.io/v1/account/${factoryAccount}/txns-only?per_page=250`,
      {
        headers: {
          Authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}`,
        },
      }
    );
    if (!Array.isArray(data?.txns))
      return res.status(500).send({
        error: "Error occured while fetching nearblocks transactions",
      });
    const txns = data.txns;

    for (const tx of txns) {
      const createdAt = new Date(Number(tx?.block_timestamp) / 1_000_000);
      const createdBy =
        tx?.predecessor_account_id || tx?.signer_account_id || "unknown";
      const outcomeSuccess = tx.outcomes.status;
      if (!outcomeSuccess) {
        continue;
      }
      for (const action of tx.actions || []) {
        if (
          action.action === "FUNCTION_CALL" &&
          action.method === "create_instance" &&
          action.args
        ) {
          try {
            const parsedArgs = JSON.parse(action.args);
            const name = parsedArgs.name;
            const instanceAccount = name + ".near";
            const daoAccount = name + ".sputnik-dao.near";
            if (!name) continue;
            await insertTreasuryToDb({
              createdAt,
              createdBy,
              instanceAccount,
              daoAccount,
              name,
            });
            console.log(`✅ Stored treasury: ${name} | by: ${createdBy}`);
          } catch (err: any) {
            console.warn("⚠️ Failed to decode/store treasury:", err.message);
          }
        }
      }
    }

    return res.send({
      message: "Successfully stored all self created treasuries to database",
    });
  } catch (err) {
    console.error("❌ Error storing treasuries:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/db/insert-treasury", async (req: Request, res: Response) => {
  const { name, createdAt, createdBy, instanceAccount, daoAccount } = req.body;

  if (!name || !createdAt || !createdBy) {
    return res
      .status(400)
      .json({ error: "Missing name, createdAt, or createdBy" });
  }

  try {
    await insertTreasuryToDb({
      createdAt: new Date(createdAt),
      createdBy,
      instanceAccount,
      daoAccount,
      name,
    });
    return res.send({ message: "Successfully stored treasury to database" });
  } catch (err) {
    console.error("❌ Failed to insert treasury:", err);
    res.status(500).json({ error: "Database insert failed" });
  }
});

router.get("/db/treasuries-report", async (_req, res) => {
  try {
    const treasuries = await prisma.treasury.findMany();

    // Get current NEAR price from your API
    const { data: nearPriceResp } = await axios.get(
      "https://ref-sdk-test-cold-haze-1300-2.fly.dev/api/near-price"
    );
    const nearPrice = Big(nearPriceResp || 0);

    const reportData: TreasuryReportRow[] = [];

    for (const treasury of treasuries) {
      let daoBalance = Big(0);
      let totalAssets = Big(0);
      const promises = [
        fetchFTBalances(treasury.daoAccount),
        fetchNearBalances(treasury.daoAccount),
        fetchFromRPC(
          {
            jsonrpc: "2.0",
            id: "policy",
            method: "query",
            params: {
              request_type: "call_function",
              finality: "final",
              method_name: "get_policy",
              account_id: treasury.daoAccount,
              args_base64: "",
            },
          },
          false
        ),
      ];

      // Conditionally add lockup balance fetch
      if (treasury.lockupContract) {
        promises.push(fetchNearBalances(treasury.lockupContract));
      } else {
        promises.push(Promise.resolve(null));
      }

      const [ftBalance, nearBalanceResp, policyResp, lockupBalanceResp] =
        await Promise.all(promises);

      // // Parse NEAR balance in USD
      const nearAmount = Big(nearBalanceResp?.["1H"]?.[0]?.balance || "0");
      const nearUSD = nearAmount.times(nearPrice);

      // FT token balance
      const ftAssetsUSD = Big(ftBalance?.totalCumulativeAmt || 0);

      // Total per treasury
      const totalAssetsUSD = ftAssetsUSD.plus(nearUSD);
      daoBalance = daoBalance.plus(totalAssetsUSD);
      totalAssets = totalAssets.plus(totalAssetsUSD);

      // Parse policy and unique members
      const rawPolicyString =
        policyResp?.result?.result
          ?.map((c: number) => String.fromCharCode(c))
          .join("") ?? "{}";

      const lockupBalance = Big(lockupBalanceResp?.["1H"]?.[0]?.balance || "0");
      const lockupBalanceUSD = lockupBalance.times(nearPrice);

      totalAssets = totalAssets.plus(lockupBalanceUSD);
      const policy = JSON.parse(rawPolicyString);
      const allMembers =
        policy.roles?.flatMap((r: any) => r.kind?.Group || []) || [];
      const uniqueMembers = new Set(allMembers);

      if (uniqueMembers.size === 0) {
        continue;
      }
      reportData.push({
        customerName: treasury.name,
        treasuryUrl: `https://${treasury.name}.near.page/`,
        daoAssetsValueUSD: Number(daoBalance),
        totalAssetsValueUSD: Number(totalAssets),
        numberOfUsers: uniqueMembers.size,
        monthlyTransactions: 0,
        lockupContract: treasury.lockupContract ?? "-",
        lockupValueUSD: Number(lockupBalanceUSD),
      });
    }

    await updateSheet(reportData);
    return res.status(200).json(reportData);
  } catch (err) {
    console.error("Error generating report:", err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

export default router;
