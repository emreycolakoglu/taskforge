-- AlterTable
ALTER TABLE "invite_tokens" ADD COLUMN "recipientEmail" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "title" TEXT NOT NULL DEFAULT 'TaskForge',
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUsername" TEXT,
    "smtpPassword" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT NOT NULL DEFAULT 'TaskForge',
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_settings" ("createdAt", "id", "onboarded", "title", "updatedAt") SELECT "createdAt", "id", "onboarded", "title", "updatedAt" FROM "settings";
DROP TABLE "settings";
ALTER TABLE "new_settings" RENAME TO "settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
