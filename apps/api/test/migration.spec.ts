import { PrismaClient } from '@prisma/client';
import { createTestPrisma, seedBoard, seedTask } from './setup';

/**
 * Projects v2 schema contract — integration-style, like the other suites.
 *
 * These assertions describe the FINAL (v2) schema, not the intermediate
 * v1 board-scoped state. After migration `projects_v2_workspace`:
 *   - Project is workspace-level: no boardId column, plus a per-project
 *     document counter (`nextDocNum`, default 1).
 *   - Documents attach to EITHER a task (boardId + taskId, as in v1) OR a
 *     project (projectId only, project-scoped `number`) — both columns are
 *     optional so the two shapes coexist.
 *   - `(projectId, number)` is unique so a project's `nextDocNum` counter can
 *     hand out numbers safely; `(boardId, number)` stays unique unchanged
 *     (SQLite unique indexes tolerate multiple NULLs, so v1 task documents
 *     are unaffected).
 *
 * RED history: written against the moment BEFORE the migration — ts-jest
 * rejected the file against the v1 client (Project required boardId; Document
 * had no projectId; Project had no nextDocNum).
 */
describe('Projects v2 schema (migration survivability)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.document.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
    await prisma.member.deleteMany();
    await prisma.status.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
  });

  it('creates a workspace project WITHOUT boardId', async () => {
    const project = await prisma.project.create({
      data: { name: 'Workspace roadmap', icon: '📦' },
    });

    expect(project.name).toBe('Workspace roadmap');
    // No boardId on the row at all — the column is gone, not merely null.
    // (Brief assertion 5: a v1 row migrated into the new table would come
    // back from findMany with the same shape; both read paths must lack it.)
    expect('boardId' in project).toBe(false);
    const rows = await prisma.project.findMany();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect('boardId' in row).toBe(false);
    }
  });

  it('creates a project document with ONLY projectId (number 1)', async () => {
    const project = await prisma.project.create({ data: { name: 'Docs home' } });

    const doc = await prisma.document.create({
      data: { projectId: project.id, number: 1, title: 'Brief', body: '' },
    });

    expect(doc.projectId).toBe(project.id);
    expect(doc.boardId).toBeNull();
    expect(doc.taskId).toBeNull();
    expect(doc.number).toBe(1);
  });

  it('rejects a duplicate (projectId, number) on project documents', async () => {
    const project = await prisma.project.create({ data: { name: 'Unique' } });
    await prisma.document.create({
      data: { projectId: project.id, number: 1, title: 'First', body: '' },
    });

    await expect(
      prisma.document.create({
        data: { projectId: project.id, number: 1, title: 'Second', body: '' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('still rejects a duplicate (boardId, number) on task documents (unchanged)', async () => {
    const board = await seedBoard(prisma);
    const taskA = await seedTask(prisma, board.statuses[0].id);
    const taskB = await seedTask(prisma, board.statuses[0].id);

    await prisma.document.create({
      data: { boardId: board.id, taskId: taskA.id, number: 5, title: 'A', body: '' },
    });
    // Same board + same number through a different task: still a collision.
    await expect(
      prisma.document.create({
        data: { boardId: board.id, taskId: taskB.id, number: 5, title: 'B', body: '' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('keeps task documents (boardId + taskId, projectId null) intact', async () => {
    const board = await seedBoard(prisma);
    const task = await seedTask(prisma, board.statuses[0].id);

    const doc = await prisma.document.create({
      data: { boardId: board.id, taskId: task.id, number: 1, title: 'Meeting notes', body: '' },
    });

    expect(doc.boardId).toBe(board.id);
    expect(doc.taskId).toBe(task.id);
    expect(doc.projectId).toBeNull();
  });

  it('defaults a fresh project nextDocNum to 1', async () => {
    const project = await prisma.project.create({ data: { name: 'Counter' } });

    expect(project.nextDocNum).toBe(1);
  });
});
