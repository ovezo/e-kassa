-- Remove modifier tables (SQLite: drop in FK-safe order)
PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS "ProductModifierGroup";
DROP TABLE IF EXISTS "ModifierOption";
DROP TABLE IF EXISTS "ModifierGroup";

-- Product: cents -> TMT (divide legacy integer cents by 100)
CREATE TABLE "Product_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "priceTmt" REAL NOT NULL,
    "categoryId" TEXT NOT NULL,
    "active" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Product_new_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "Product_new" ("id", "name", "priceTmt", "categoryId", "active", "sortOrder")
SELECT "id", "name", CAST("priceCents" AS REAL) / 100.0, "categoryId", "active", "sortOrder" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "Product_new" RENAME TO "Product";

-- Order: cents -> TMT
CREATE TABLE "Order_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "tableId" TEXT,
    "openedByUserId" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "subtotalTmt" REAL NOT NULL DEFAULT 0,
    "serviceFeeTmt" REAL NOT NULL DEFAULT 0,
    "deliveryFeeTmt" REAL NOT NULL DEFAULT 0,
    "totalTmt" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Order_new_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "CafeTable" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_new_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "Order_new" (
    "id", "type", "status", "tableId", "openedByUserId", "openedAt", "closedAt",
    "subtotalTmt", "serviceFeeTmt", "deliveryFeeTmt", "totalTmt"
)
SELECT
    "id", "type", "status", "tableId", "openedByUserId", "openedAt", "closedAt",
    CAST("subtotalCents" AS REAL) / 100.0,
    CAST("serviceFeeCents" AS REAL) / 100.0,
    CAST("deliveryFeeCents" AS REAL) / 100.0,
    CAST("totalCents" AS REAL) / 100.0
FROM "Order";
DROP TABLE "Order";
ALTER TABLE "Order_new" RENAME TO "Order";

-- OrderLine: remove modifiersJson; cents -> Tmt
CREATE TABLE "OrderLine_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "unitPriceTmt" REAL NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "lineTotalTmt" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderLine_new_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderLine_new_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "OrderLine_new" (
    "id", "orderId", "productId", "productName", "unitPriceTmt", "qty", "lineTotalTmt", "createdAt"
)
SELECT
    "id", "orderId", "productId", "productName",
    CAST("unitPriceCents" AS REAL) / 100.0,
    "qty",
    CAST("lineTotalCents" AS REAL) / 100.0,
    "createdAt"
FROM "OrderLine";
DROP TABLE "OrderLine";
ALTER TABLE "OrderLine_new" RENAME TO "OrderLine";

-- Settings: migrate delivery fee key to TMT amount (legacy value was cents)
UPDATE "Setting" SET key = 'delivery_fee_tmt', value = printf('%.2f', CAST(value AS REAL) / 100.0) WHERE key = 'delivery_fee_cents';
DELETE FROM "Setting" WHERE key = 'currency_code';

PRAGMA foreign_keys=ON;
