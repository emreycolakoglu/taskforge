-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Status" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" REAL NOT NULL,
    "color" TEXT DEFAULT '#6366f1',
    "wipLimit" INTEGER,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Status_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Status" ("boardId", "color", "createdAt", "id", "isDone", "name", "position", "updatedAt", "wipLimit") SELECT "boardId", "color", "createdAt", "id", "isDone", "name", "position", "updatedAt", "wipLimit" FROM "Status";
DROP TABLE "Status";
ALTER TABLE "new_Status" RENAME TO "Status";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
