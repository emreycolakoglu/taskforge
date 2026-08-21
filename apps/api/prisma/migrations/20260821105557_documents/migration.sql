-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "documents_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Board" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT DEFAULT '⭐',
    "nextTaskNum" INTEGER NOT NULL DEFAULT 1,
    "nextDocNum" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Board" ("createdAt", "description", "icon", "id", "identifier", "name", "nextTaskNum", "slug", "updatedAt") SELECT "createdAt", "description", "icon", "id", "identifier", "name", "nextTaskNum", "slug", "updatedAt" FROM "Board";
DROP TABLE "Board";
ALTER TABLE "new_Board" RENAME TO "Board";
CREATE UNIQUE INDEX "Board_slug_key" ON "Board"("slug");
CREATE UNIQUE INDEX "Board_identifier_key" ON "Board"("identifier");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "documents_boardId_idx" ON "documents"("boardId");

-- CreateIndex
CREATE INDEX "documents_taskId_idx" ON "documents"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_boardId_number_key" ON "documents"("boardId", "number");
