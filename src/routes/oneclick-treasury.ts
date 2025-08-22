import { Router, Request, Response } from "express";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

const router = Router();

// Environment variable for 1Click API key
const ONECLICK_API_KEY = process.env.ONECLICK_API_KEY;
const ONECLICK_API_URL =
  process.env.ONECLICK_API_URL || "https://1click.chaindefuser.com/v0";

interface QuoteRequest {
  dry?: boolean;
  swapType: string;
  slippageTolerance: number;
  originAsset: string;
  depositType: string;
  destinationAsset: string;
  refundTo: string;
  refundType: string;
  recipient: string;
  recipientType: string;
  deadline: string;
  amount: string;
}

interface ProposalPayload {
  tokenIn: string;
  tokenInSymbol: string;
  tokenOut: string;
  networkOut: string;
  amountIn: string;
  quote: any;
}

/**
 * Validates that an address is a sputnik-dao.near address
 */
function isSputnikDaoAddress(address: string): boolean {
  return (
    address.endsWith(".sputnik-dao.near") || address === "sputnik-dao.near"
  );
}

/**
 * Treasury 1Click endpoint that returns a proposal payload
 * This endpoint:
 * 1. Fetches a quote from 1Click API
 * 2. Validates that refund and recipient addresses are sputnik-dao addresses
 * 3. Returns the formatted proposal payload
 */
router.post(
  "/api/treasury/oneclick-quote",
  async (req: Request, res: Response) => {
    try {
      const {
        treasuryDaoID,
        inputToken,
        outputToken,
        amountIn,
        slippageTolerance,
        networkOut,
      } = req.body;

      // Validate required parameters
      if (
        !treasuryDaoID ||
        !inputToken ||
        !outputToken ||
        !amountIn ||
        !slippageTolerance
      ) {
        return res.status(400).json({
          error:
            "Missing required parameters: treasuryDaoID, inputToken, outputToken, amountIn, slippageTolerance",
        });
      }

      // Validate that treasuryDaoID is a sputnik-dao address
      if (!isSputnikDaoAddress(treasuryDaoID)) {
        return res.status(403).json({
          error:
            "Invalid treasury DAO ID. Only sputnik-dao.near addresses are allowed.",
        });
      }

      // Calculate deadline (7 days for DAO voting)
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 7);

      // Prepare the quote request for 1Click API
      const quoteRequest: QuoteRequest = {
        dry: false, // Set to false to get actual quote with API key
        swapType: "EXACT_INPUT",
        slippageTolerance: parseInt(slippageTolerance),
        originAsset: inputToken.id.startsWith("nep141:")
          ? inputToken.id
          : `nep141:${inputToken.id}`,
        depositType: "INTENTS",
        destinationAsset: outputToken.id,
        refundTo: treasuryDaoID,
        refundType: "INTENTS",
        recipient: treasuryDaoID,
        recipientType: "INTENTS",
        deadline: deadline.toISOString(),
        amount: amountIn,
      };

      // Validate refund and recipient addresses one more time
      if (
        !isSputnikDaoAddress(quoteRequest.refundTo) ||
        !isSputnikDaoAddress(quoteRequest.recipient)
      ) {
        return res.status(403).json({
          error:
            "Security validation failed: refund and recipient must be sputnik-dao.near addresses",
        });
      }

      console.log("Fetching quote from 1Click API:", quoteRequest);

      // Make request to 1Click API with API key
      const headers: any = {
        "content-type": "application/json",
      };

      // Add API key if available
      if (ONECLICK_API_KEY) {
        headers["x-api-key"] = ONECLICK_API_KEY;
      }

      const response = await axios.post(
        `${ONECLICK_API_URL}/quote`,
        quoteRequest,
        { headers }
      );

      if (!response.data || response.data.error) {
        throw new Error(
          response.data?.error || "Failed to fetch quote from 1Click API"
        );
      }

      // Validate the quote response
      if (!response.data.quote) {
        throw new Error("Invalid quote response format from 1Click API");
      }

      // Format the proposal payload
      const proposalPayload: ProposalPayload = {
        tokenIn: inputToken.id,
        tokenInSymbol: inputToken.symbol,
        tokenOut: outputToken.id,
        networkOut: networkOut || outputToken.blockchain,
        amountIn: response.data.quote.amountInFormatted || amountIn, // Use formatted amount from quote for display
        quote: response.data.quote,
      };

      // Include signature if present
      if (response.data.signature) {
        proposalPayload.quote.signature = response.data.signature;
      }

      return res.json({
        success: true,
        proposalPayload,
        quoteRequest, // Include for debugging/transparency
      });
    } catch (error) {
      console.error("Error in /api/treasury/oneclick-quote:", error);

      if (axios.isAxiosError(error)) {
        // Handle 1Click API errors
        if (error.response?.status === 401) {
          return res.status(500).json({
            error:
              "1Click API authentication failed. Please check API key configuration.",
          });
        }
        if (error.response?.data?.error) {
          return res.status(400).json({
            error: error.response.data.error,
          });
        }
      }

      if (error instanceof Error) {
        return res.status(500).json({
          error: error.message,
        });
      }

      return res.status(500).json({
        error: "An unexpected error occurred while fetching quote",
      });
    }
  }
);

export default router;
