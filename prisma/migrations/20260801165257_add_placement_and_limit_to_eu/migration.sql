-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShopSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shopDomain" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "withdrawalWindowDays" INTEGER NOT NULL DEFAULT 14,
    "customEmailSubject" TEXT NOT NULL DEFAULT 'Confirmation of Your Contract Withdrawal',
    "customEmailBody" TEXT NOT NULL DEFAULT 'We have received your request to withdraw from the contract. Here are your details:',
    "buttonColor" TEXT NOT NULL DEFAULT '#000000',
    "buttonTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "buttonLabel" TEXT NOT NULL DEFAULT 'Withdraw from Contract',
    "buttonPlacement" TEXT NOT NULL DEFAULT 'sticky_bottom_right',
    "limitToEU" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_ShopSettings" ("buttonColor", "buttonLabel", "buttonTextColor", "customEmailBody", "customEmailSubject", "id", "isActive", "shopDomain", "withdrawalWindowDays") SELECT "buttonColor", "buttonLabel", "buttonTextColor", "customEmailBody", "customEmailSubject", "id", "isActive", "shopDomain", "withdrawalWindowDays" FROM "ShopSettings";
DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
CREATE UNIQUE INDEX "ShopSettings_shopDomain_key" ON "ShopSettings"("shopDomain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
