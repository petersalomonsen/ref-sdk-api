import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express from "express";
import oneclickTreasuryRoutes from "../src/routes/oneclick-treasury";

// Create a test app
const app = express();
app.use(express.json());
app.use("/", oneclickTreasuryRoutes);

// Mock axios
jest.mock("axios");

describe("Treasury 1Click API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/treasury/oneclick-quote", () => {
    it("should reject non-sputnik-dao addresses for treasuryDaoID", async () => {
      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "regular.near", // Not a sputnik-dao address
          inputToken: { id: "wrap.near", symbol: "WNEAR" },
          outputToken: { id: "usdc", blockchain: "ethereum" },
          amountIn: "1000000000000000000",
          slippageTolerance: "100",
          networkOut: "Ethereum",
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain(
        "Only sputnik-dao.near addresses are allowed"
      );
    });

    it("should accept valid sputnik-dao addresses", async () => {
      const axios = require("axios");
      axios.post = jest.fn().mockResolvedValue({
        data: {
          quote: {
            amountOut: "1000000",
            amountIn: "1000000000000000000",
            deadline: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
          },
          signature: "mock-signature",
        },
      });

      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "treasury.sputnik-dao.near",
          inputToken: { id: "wrap.near", symbol: "WNEAR", decimals: 24 },
          outputToken: { id: "usdc", blockchain: "ethereum" },
          amountIn: "1000000000000000000",
          slippageTolerance: "100",
          networkOut: "Ethereum",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.proposalPayload).toBeDefined();
      expect(response.body.proposalPayload.tokenIn).toBe("wrap.near");
      expect(response.body.proposalPayload.tokenInSymbol).toBe("WNEAR");
    });

    it("should validate required parameters", async () => {
      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "treasury.sputnik-dao.near",
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Missing required parameters");
    });

    it("should reject non-sputnik-dao addresses in refundTo", async () => {
      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "hacked.near", // Trying to use a non-sputnik address
          inputToken: { id: "wrap.near", symbol: "WNEAR" },
          outputToken: { id: "usdc", blockchain: "ethereum" },
          amountIn: "1000000000000000000",
          slippageTolerance: "100",
          networkOut: "Ethereum",
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain(
        "Only sputnik-dao.near addresses are allowed"
      );
    });

    it("should handle 1Click API errors gracefully", async () => {
      const axios = require("axios");
      axios.post = jest.fn().mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: "Invalid token",
          },
        },
        isAxiosError: true,
      });

      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "treasury.sputnik-dao.near",
          inputToken: { id: "invalid.near", symbol: "INVALID" },
          outputToken: { id: "usdc", blockchain: "ethereum" },
          amountIn: "1000000000000000000",
          slippageTolerance: "100",
          networkOut: "Ethereum",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid token");
    });

    it("should handle 1Click API authentication errors", async () => {
      const axios = require("axios");
      axios.post = jest.fn().mockRejectedValue({
        response: {
          status: 401,
        },
        isAxiosError: true,
      });

      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "treasury.sputnik-dao.near",
          inputToken: { id: "wrap.near", symbol: "WNEAR" },
          outputToken: { id: "usdc", blockchain: "ethereum" },
          amountIn: "1000000000000000000",
          slippageTolerance: "100",
          networkOut: "Ethereum",
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain("1Click API authentication failed");
    });

    it("should set dry to false in requests to 1Click API", async () => {
      const axios = require("axios");
      let capturedRequest: any;

      axios.post = jest.fn().mockImplementation((url, data) => {
        capturedRequest = data;
        return Promise.resolve({
          data: {
            quote: {
              amountOut: "1000000",
              amountIn: "1000000000000000000",
              deadline: new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000
              ).toISOString(),
            },
            signature: "mock-signature",
          },
        });
      });

      await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "treasury.sputnik-dao.near",
          inputToken: { id: "wrap.near", symbol: "WNEAR" },
          outputToken: { id: "usdc", blockchain: "ethereum" },
          amountIn: "1000000000000000000",
          slippageTolerance: "100",
          networkOut: "Ethereum",
        });

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest.dry).toBe(false);
      expect(capturedRequest.refundTo).toBe("treasury.sputnik-dao.near");
      expect(capturedRequest.recipient).toBe("treasury.sputnik-dao.near");
    });
  });
});
