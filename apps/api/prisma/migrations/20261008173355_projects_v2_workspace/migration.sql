/*
  Warnings:

  - You are about to drop the column `boardId` on the `projects` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT,
    "taskId" TEXT,
    "projectId" TEXT,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "documents_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_documents" ("boardId", "body", "createdAt", "id", "isPublic", "number", "taskId", "title", "updatedAt") SELECT "boardId", "body", "createdAt", "id", "isPublic", "number", "taskId", "title", "updatedAt" FROM "documents";
DROP TABLE "documents";
ALTER TABLE "new_documents" RENAME TO "documents";
CREATE INDEX "documents_boardId_idx" ON "documents"("boardId");
CREATE INDEX "documents_taskId_idx" ON "documents"("taskId");
CREATE INDEX "documents_projectId_idx" ON "documents"("projectId");
CREATE UNIQUE INDEX "documents_boardId_number_key" ON "documents"("boardId", "number");
CREATE UNIQUE INDEX "documents_projectId_number_key" ON "documents"("projectId", "number");
CREATE TABLE "new_projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT '📦',
    "leadId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "completedAt" DATETIME,
    "startDate" DATETIME,
    "targetDate" DATETIME,
    "position" REAL NOT NULL DEFAULT 0,
    "nextDocNum" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "projects_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_projects" ("completedAt", "createdAt", "description", "icon", "id", "leadId", "name", "position", "startDate", "status", "targetDate", "updatedAt") SELECT "completedAt", "createdAt", "description", "icon", "id", "leadId", "name", "position", "startDate", "status", "targetDate", "updatedAt" FROM "projects";
DROP TABLE "projects";
ALTER TABLE "new_projects" RENAME TO "projects";
CREATE INDEX "projects_position_idx" ON "projects"("position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
