import express, { Request, Response } from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { getWhitelistTokens } from "./whitelist-tokens";
import { getSwap, SwapParams } from "./swap";
import { getNearPrice } from "./near-price";
import { getFTTokens } from "./ft-tokens";
import { getAllTokenBalanceHistory } from "./all-token-balance-history";
import {
  getTransactionsTransferHistory,
  TransferHistoryParams,
} from "./transactions-transfer-history";
import prisma from "./prisma";
import { tokens } from "./constants/tokens";
import axios from "axios";
import treasuryRoutes from "./routes/metrics";

dotenv.config();

const app = express();
app.set("trust proxy", 1);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const apiLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use forwarded IP if available, otherwise use the direct IP
    return req.ip || req.connection.remoteAddress || "unknown";
  },
});

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use("/api/", apiLimiter);
app.use("/", treasuryRoutes);

const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 120 }); // Cache for 2 minutes

app.get("/api/whitelist-tokens", async (req: Request, res: Response) => {
  try {
    const { account } = req.query as { account: string };
    const tokens = await getWhitelistTokens(account, cache);
    return res.json(tokens);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "An error occurred while fetching whitelisted tokens and balances",
    });
  }
});

app.get("/api/swap", async (req: Request, res: Response) => {
  try {
    const params = req.query as SwapParams;

    // Validate required parameters
    if (
      !params.accountId ||
      !params.tokenIn ||
      !params.tokenOut ||
      !params.amountIn
    ) {
      return res.status(400).json({
        error:
          "Missing required parameters. Required: accountId, tokenIn, tokenOut, amountIn",
      });
    }

    // Set default slippage if not provided
    if (!params.slippage) {
      params.slippage = "0.01"; // 1% default slippage
    }

    const result = await getSwap(params);
    return res.json(result);
  } catch (error) {
    console.error("Error in /api/swap:", error);
    if (error instanceof Error) {
      return res.status(500).json({
        error: error.message,
      });
    }
    return res.status(500).json({
      error: "An unexpected error occurred while creating swap",
    });
  }
});

app.get("/api/near-price", async (req: Request, res: Response) => {
  try {
    const result = await getNearPrice(cache);
    return res.json(result);
  } catch (error) {
    try {
      const response = await prisma.nearPrice.findFirst({
        orderBy: {
          timestamp: "desc",
        },
      });
      return res.status(200).json(response?.price);
    } catch (error) {
      return res.status(500).json({
        error: "Failed to fetch NEAR price from all sources.",
      });
    }
  }
});

app.get("/api/ft-tokens", async (req: Request, res: Response) => {
  try {
    const { account_id } = req.query;

    if (!account_id || typeof account_id !== "string") {
      return res.status(400).json({ error: "Account ID is required" });
    }
    const result = await getFTTokens(account_id, cache);
    return res.json(result);
  } catch (error) {
    try {
      const result = await prisma.fTToken.findFirst({
        where: {
          account_id: req.query.account_id as string,
        },
        orderBy: {
          timestamp: "desc",
        },
      });
      return res.status(200).json(result);
    } catch (error) {
      console.error("Error fetching FT tokens:", error);
      if (error instanceof Error && error.message === "No FT tokens found") {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  }
});


app.get(
  "/api/all-token-balance-history",
  async (req: Request, res: Response) => {
    const { account_id, token_id } = req.query;

    if (
      !account_id ||
      !token_id ||
      typeof account_id !== "string" ||
      typeof token_id !== "string"
    ) {
      return res.status(400).json({
        error: "Missing required parameters: account_id and token_id",
      });
    }

    const cacheKey = `all:${account_id}:${token_id}`;

    try {
      const result = await getAllTokenBalanceHistory(
        cache,
        cacheKey,
        account_id,
        token_id
      );
      return res.json(result);
    } catch (error) {
      console.error(
        "Unhandled error in /api/all-token-balance-history:",
        error
      );
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.get(
  "/api/transactions-transfer-history",
  async (req: Request, res: Response) => {
    try {
      const params = req.query as TransferHistoryParams;

      if (!params.treasuryDaoID) {
        return res.status(400).send({ error: "treasuryDaoID is required" });
      }

      const data = await getTransactionsTransferHistory(params);
      return res.send({ data });
    } catch (error) {
      console.error("Error fetching data:", error);
      return res.status(500).send({ error: "An error occurred" });
    }
  }
);

app.get("/api/ft-token-price", async (req: Request, res: Response) => {
  try {
    const { account_id } = req.query;

    if (!account_id || typeof account_id !== "string") {
      return res.status(400).send({ error: "account_id is required" });
    }

    const contract = account_id === "near" ? "wrap.near" : account_id;
    const cacheKey = `ft-price:${contract}`;

    const cachedPrice = cache.get(cacheKey);
    if (cachedPrice !== undefined) {
      console.log(`🔁 Returning cached price for ${contract}`);
      return res.send({ price: cachedPrice });
    }

    const { data } = await axios.get(
      `https://api.nearblocks.io/v1/fts/${contract}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}`,
        },
      }
    );

    const contractData = data?.contracts?.[0];
    const price = parseFloat(contractData?.price) || 0;

    cache.set(cacheKey, price);
    return res.send({ price });
  } catch (error) {
    console.error("Error fetching token price:", error);
    return res.status(500).send({ error: "Failed to fetch token price" });
  }
});

// Start the server
if (process.env.NODE_ENV !== "test") {
  app.listen(port, hostname, () => {
    console.log(`Server is running on http://${hostname}:${port}`);
  });
}

export default app;
