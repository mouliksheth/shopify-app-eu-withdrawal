-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shopDomain" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "withdrawalWindowDays" INTEGER NOT NULL DEFAULT 14,
    "customEmailSubject" TEXT NOT NULL DEFAULT 'Confirmation of Your Contract Withdrawal',
    "customEmailBody" TEXT NOT NULL DEFAULT 'We have received your request to withdraw from the contract. Here are your details:',
    "buttonColor" TEXT NOT NULL DEFAULT '#000000',
    "buttonTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "buttonLabel" TEXT NOT NULL DEFAULT 'Withdraw from Contract'
);

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shopDomain" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "selectedItems" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "complianceNotes" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shopDomain_key" ON "ShopSettings"("shopDomain");
