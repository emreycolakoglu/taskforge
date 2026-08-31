-- CreateTable
CREATE TABLE "views" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT NOT NULL,
    "userId" TEXT,
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

-- CreateIndex
CREATE INDEX "views_boardId_idx" ON "views"("boardId");
