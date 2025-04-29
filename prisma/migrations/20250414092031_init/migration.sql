-- CreateTable
CREATE TABLE "TokenBalanceHistory" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "balance_history" JSONB NOT NULL,
    "fromBlock" INTEGER NOT NULL,
    "toBlock" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenBalanceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RpcRequest" (
    "id" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestBody" JSONB NOT NULL,
    "responseBody" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RpcRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FTToken" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "totalCumulativeAmt" DOUBLE PRECISION NOT NULL,
    "fts" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FTToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NearPrice" (
    "id" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NearPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountBlockExistence" (
    "id" SERIAL NOT NULL,
    "accountId" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "exists" BOOLEAN NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountBlockExistence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferHistory" (
    "cacheKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferHistory_pkey" PRIMARY KEY ("cacheKey")
);

-- CreateIndex
CREATE INDEX "TokenBalanceHistory_account_id_token_id_period_idx" ON "TokenBalanceHistory"("account_id", "token_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "TokenBalanceHistory_account_id_token_id_period_key" ON "TokenBalanceHistory"("account_id", "token_id", "period");

-- CreateIndex
CREATE INDEX "RpcRequest_timestamp_idx" ON "RpcRequest"("timestamp");

-- CreateIndex
CREATE INDEX "AccountBlockExistence_accountId_blockHeight_idx" ON "AccountBlockExistence"("accountId", "blockHeight");

-- CreateIndex
CREATE UNIQUE INDEX "AccountBlockExistence_accountId_blockHeight_key" ON "AccountBlockExistence"("accountId", "blockHeight");
