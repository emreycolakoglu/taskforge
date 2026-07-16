-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "statusId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" REAL NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "doneAt" DATETIME,
    "dueDate" DATETIME,
    "assigneeId" TEXT,
    "metadata" TEXT,
    "parentId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Status" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("assigneeId", "boardId", "createdAt", "description", "doneAt", "dueDate", "id", "metadata", "number", "parentId", "position", "priority", "statusId", "title", "updatedAt") SELECT "assigneeId", "boardId", "createdAt", "description", "doneAt", "dueDate", "id", "metadata", "number", "parentId", "position", "priority", "statusId", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_boardId_idx" ON "Task"("boardId");
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");
CREATE UNIQUE INDEX "Task_boardId_number_key" ON "Task"("boardId", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
