-- CreateTable
CREATE TABLE "Treasury" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "instanceAccount" TEXT NOT NULL,
    "daoAccount" TEXT NOT NULL,

    CONSTRAINT "Treasury_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Treasury_name_key" ON "Treasury"("name");
