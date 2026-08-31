/*
  Warnings:

  - Made the column `userId` on table `views` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_views" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "filters" TEXT NOT NULL,
    "groupBy" TEXT NOT NULL DEFAULT 'status',
    "sortBy" TEXT NOT NULL DEFAULT 'position',
    "layout" TEXT NOT NULL DEFAULT 'board',
    "position" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "views_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_views" ("boardId", "createdAt", "filters", "groupBy", "id", "layout", "name", "position", "sortBy", "updatedAt", "userId") SELECT "boardId", "createdAt", "filters", "groupBy", "id", "layout", "name", "position", "sortBy", "updatedAt", "userId" FROM "views";
DROP TABLE "views";
ALTER TABLE "new_views" RENAME TO "views";
CREATE INDEX "views_boardId_idx" ON "views"("boardId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
