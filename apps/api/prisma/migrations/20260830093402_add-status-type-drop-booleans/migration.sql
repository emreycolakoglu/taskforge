/*
  Warnings:

  - You are about to drop the column `isDone` on the `Status` table. All the data in the column will be lost.
  - You are about to drop the column `isDuplicate` on the `Status` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Status" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'todo',
    "position" REAL NOT NULL,
    "color" TEXT DEFAULT '#6366f1',
    "wipLimit" INTEGER,
    "progress" INTEGER DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Status_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Status" ("id", "boardId", "name", "type", "position", "color", "wipLimit", "progress", "createdAt", "updatedAt")
SELECT "id", "boardId", "name",
  CASE WHEN "isDone" = 1 THEN 'done' WHEN "isDuplicate" = 1 THEN 'duplicate' ELSE 'todo' END,
  "position", "color", "wipLimit", "progress", "createdAt", "updatedAt"
FROM "Status";
DROP TABLE "Status";
ALTER TABLE "new_Status" RENAME TO "Status";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
