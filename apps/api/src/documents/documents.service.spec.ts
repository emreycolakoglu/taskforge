import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { MembersService } from '../members/members.service';
import { LocalDiskDriver } from '../storage/local-disk.driver';
import {
  createTestPrisma,
  seedBoard,
  seedTask,
  seedDocument,
  seedUser,
  seedProject,
} from '../../test/setup';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: PrismaService;
  let events: EventsService;
  let attachments: AttachmentsService;
  let driver: LocalDiskDriver;
  let storageRoot: string;
  let board: any;
  let task: any;
  let user: { id: string; displayName: string };

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    storageRoot = mkdtempSync(join(tmpdir(), 'tf-doc-att-'));
    driver = new LocalDiskDriver(storageRoot);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
        {
          provide: AttachmentsService,
          useValue: new AttachmentsService(prisma, events, new MembersService(prisma), driver),
        },
      ],
    }).compile();
    service = module.get<DocumentsService>(DocumentsService);
    attachments = module.get<AttachmentsService>(AttachmentsService);
  });

  afterAll(async () => {
    rmSync(storageRoot, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    task = await seedTask(prisma, board.statuses[0].id);
    const dbUser = await seedUser(prisma);
    user = { id: dbUser.id, displayName: dbUser.displayName };
  });

  afterEach(async () => {
    await prisma.attachment.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.taskSubscription.deleteMany();
    await prisma.taskRelation.deleteMany();
    await prisma.taskLabel.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.document.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
    await prisma.label.deleteMany();
    await prisma.status.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('findByBoard', () => {
    it('lists documents without exposing the body', async () => {
      await seedDocument(prisma, task.id, { title: 'Alpha' });
      await seedDocument(prisma, task.id, { title: 'Beta', body: 'secret body' });
      const docs = await service.findByBoard(board.id);
      expect(docs).toHaveLength(2);
      expect(docs[0]).not.toHaveProperty('body');
    });
  });

  describe('findByTask', () => {
    it('returns docs newest first, no body', async () => {
      await seedDocument(prisma, task.id, { title: 'One' });
      await new Promise((r) => setTimeout(r, 5));
      await seedDocument(prisma, task.id, { title: 'Two' });
      const docs = await service.findByTask(task.id);
      expect(docs).toHaveLength(2);
      expect(docs[0].title).toBe('Two');
      expect(docs[0]).toHaveProperty('docNumber', 'D-2');
      expect(docs[0]).not.toHaveProperty('body');
    });
  });

  describe('findOne', () => {
    it('returns the full doc with taskNumber', async () => {
      const doc = await seedDocument(prisma, task.id, { title: 'Full', body: '**bold**' });
      const found = await service.findOne(doc.id);
      expect(found.body).toBe('**bold**');
      expect(found.taskNumber).toBe(`${board.identifier}-${task.number}`);
      expect(found.taskTitle).toBe(task.title);
    });

    it('throws NotFoundException for a missing doc', async () => {
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('assigns a board-level number and increments the counter', async () => {
      const d1 = await service.create({ taskId: task.id }, { title: 'First', body: 'a' }, user);
      const d2 = await service.create({ taskId: task.id }, { title: 'Second' }, user);
      expect(d1.number).toBe(1);
      expect(d1.docNumber).toBe('D-1');
      expect(d2.number).toBe(2);
      expect(d2.docNumber).toBe('D-2');
      const refreshed = await prisma.board.findUniqueOrThrow({ where: { id: board.id } });
      expect(refreshed.nextDocNum).toBe(3);
    });

    it('writes doc_created activity on the task', async () => {
      await service.create({ taskId: task.id }, { title: 'Spec' }, user);
      const activity = await prisma.activity.findFirst({
        where: { taskId: task.id, action: 'doc_created' },
      });
      expect(activity).toBeDefined();
      expect(activity!.actorId).toBe(user.id);
    });
  });

  describe('update', () => {
    it('updates title and body', async () => {
      const doc = await seedDocument(prisma, task.id, { title: 'Before' });
      const updated = await service.update(doc.id, { title: 'After', body: 'new' }, user);
      expect(updated.title).toBe('After');
      expect(updated.body).toBe('new');
    });

    it('writes doc_updated activity only when something changed', async () => {
      const doc = await seedDocument(prisma, task.id, { title: 'Stable' });
      await service.update(doc.id, { title: 'Stable' }, user); // no-op
      await service.update(doc.id, { title: 'Changed' }, user);
      const count = await prisma.activity.count({
        where: { taskId: task.id, action: 'doc_updated' },
      });
      expect(count).toBe(1);
    });

    it('throws NotFoundException for a missing doc', async () => {
      await expect(service.update('nope', { title: 'X' }, user)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes and writes doc_deleted activity', async () => {
      const doc = await seedDocument(prisma, task.id);
      await service.remove(doc.id, user);
      const remaining = await prisma.document.findMany({ where: { taskId: task.id } });
      expect(remaining).toHaveLength(0);
      const activity = await prisma.activity.findFirst({
        where: { taskId: task.id, action: 'doc_deleted' },
      });
      expect(activity).toBeDefined();
    });

    it('removes attachment rows and storage objects on document delete', async () => {
      const doc = await seedDocument(prisma, task.id);
      const staged = join(tmpdir(), `tf-doc-del-${Date.now()}.txt`);
      writeFileSync(staged, 'payload');
      await attachments.create({
        subjectType: 'document',
        subjectId: doc.id,
        filename: 'notes.txt',
        mimeType: 'text/plain',
        tempPath: staged,
        user: { id: user.id, displayName: user.displayName, role: 'member' },
      });
      const stored = await prisma.attachment.findFirst({
        where: { subjectType: 'document', subjectId: doc.id },
      });
      const storageKey = stored!.storageKey;
      expect(await driver.stat(storageKey)).not.toBeNull();

      await service.remove(doc.id, user);

      const rows = await prisma.attachment.findMany({
        where: { subjectType: 'document', subjectId: doc.id },
      });
      expect(rows).toHaveLength(0);
      expect(await driver.stat(storageKey)).toBeNull();
    });
  });

  describe('setPublic', () => {
    it('publishes and unpublishes idempotently', async () => {
      const doc = await seedDocument(prisma, task.id);
      const published = await service.setPublic(doc.id, true, user);
      expect(published.isPublic).toBe(true);
      await service.setPublic(doc.id, true, user); // no-op
      await service.setPublic(doc.id, false, user);
      const privateDoc = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(privateDoc.isPublic).toBe(false);
      const pubActivities = await prisma.activity.count({
        where: { taskId: task.id, action: 'published' },
      });
      expect(pubActivities).toBe(1);
    });
  });

  // ─── Project documents (Projects v2) ───
  // A document hangs off exactly one subject: a task (board-numbered) or a
  // project (project-numbered, boardId/taskId null, no Activity rows).
  describe('project documents', () => {
    let project: any;

    beforeEach(async () => {
      project = await seedProject(prisma, { name: 'Roadmap', icon: '🚀' });
    });

    const captureEmits = () => {
      const emitted: any[] = [];
      const orig = events.emit.bind(events);
      (events as any).emit = (...args: any[]) => {
        emitted.push({ event: args[0], data: args[1], boardId: args[2] });
        return orig(...args);
      };
      return { emitted, restore: () => ((events as any).emit = orig) };
    };

    it('rejects a subject with both taskId and projectId', async () => {
      await expect(
        service.create({ taskId: task.id, projectId: project.id }, { title: 'X' }, user),
      ).rejects.toThrow(
        new BadRequestException('Attach the document to a task or a project, not both'),
      );
      expect(await prisma.document.count()).toBe(0);
    });

    it('rejects a subject with neither taskId nor projectId', async () => {
      await expect(service.create({}, { title: 'X' }, user)).rejects.toThrow(BadRequestException);
      expect(await prisma.document.count()).toBe(0);
    });

    it('404s for an unknown project', async () => {
      await expect(service.create({ projectId: 'nope' }, { title: 'X' }, user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('numbers from project.nextDocNum, stores null board/task, leaves the board counter alone', async () => {
      const d1 = await service.create({ projectId: project.id }, { title: 'One', body: 'a' }, user);
      const d2 = await service.create({ projectId: project.id }, { title: 'Two' }, user);
      expect(d1.number).toBe(1);
      expect(d2.number).toBe(2);
      expect(d1.docNumber).toBe('D-1');
      expect(d1.boardId).toBeNull();
      expect(d1.taskId).toBeNull();
      expect(d1.projectId).toBe(project.id);
      expect(d1.project).toEqual({ id: project.id, name: 'Roadmap', icon: '🚀' });
      const refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(refreshed.nextDocNum).toBe(3);
      const boardAfter = await prisma.board.findUniqueOrThrow({ where: { id: board.id } });
      expect(boardAfter.nextDocNum).toBe(1);
    });

    it('task-doc numbering is unaffected by project docs', async () => {
      await service.create({ projectId: project.id }, { title: 'P' }, user);
      const t = await service.create({ taskId: task.id }, { title: 'T' }, user);
      expect(t.number).toBe(1);
      expect(t.boardId).toBe(board.id);
      expect(t.projectId).toBeNull();
    });

    it('create emits globally (no board scope) with projectId in the payload', async () => {
      const { emitted, restore } = captureEmits();
      try {
        await service.create({ projectId: project.id }, { title: 'P' }, user);
      } finally {
        restore();
      }
      expect(emitted).toHaveLength(1);
      expect(emitted[0].event).toBe('document:created');
      expect(emitted[0].boardId).toBeUndefined();
      expect(emitted[0].data.projectId).toBe(project.id);
    });

    it('lists by project without the body', async () => {
      await service.create({ projectId: project.id }, { title: 'P', body: 'secret' }, user);
      await seedDocument(prisma, task.id, { title: 'task doc' });
      const docs = await service.findByProject(project.id);
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('P');
      expect(docs[0]).not.toHaveProperty('body');
      expect(docs[0].docNumber).toBe('D-1');
      expect(docs[0].attachments).toEqual([]);
    });

    it('findOne returns project info and null board/task fields instead of crashing', async () => {
      const doc = await service.create({ projectId: project.id }, { title: 'P', body: 'b' }, user);
      const found = await service.findOne(doc.id);
      expect(found.body).toBe('b');
      expect(found.boardIdentifier).toBeNull();
      expect(found.taskNumber).toBeNull();
      expect(found.taskTitle).toBeNull();
      expect(found.project).toEqual({ id: project.id, name: 'Roadmap', icon: '🚀' });
      expect(found.docNumber).toBe('D-1');
    });

    it('updates a project doc without touching the counter', async () => {
      const doc = await service.create({ projectId: project.id }, { title: 'Before' }, user);
      const updated = await service.update(doc.id, { title: 'After', body: 'x' }, user);
      expect(updated.title).toBe('After');
      expect(updated.number).toBe(1);
      expect(updated.docNumber).toBe('D-1');
      const refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(refreshed.nextDocNum).toBe(2);
    });

    it('removes a project doc', async () => {
      const doc = await service.create({ projectId: project.id }, { title: 'Gone' }, user);
      const { emitted, restore } = captureEmits();
      try {
        await service.remove(doc.id, user);
      } finally {
        restore();
      }
      expect(await prisma.document.findUnique({ where: { id: doc.id } })).toBeNull();
      expect(emitted[0].event).toBe('document:deleted');
      expect(emitted[0].boardId).toBeUndefined();
      expect(emitted[0].data.projectId).toBe(project.id);
    });

    it('writes no Activity rows for create/update/remove (Activity.taskId is required)', async () => {
      const doc = await service.create({ projectId: project.id }, { title: 'A' }, user);
      await service.update(doc.id, { title: 'B' }, user);
      await service.remove(doc.id, user);
      expect(await prisma.activity.count()).toBe(0);
    });

    it('refuses to publish a project doc — there is no public address for it', async () => {
      const doc = await service.create({ projectId: project.id }, { title: 'Private' }, user);
      await expect(service.setPublic(doc.id, true, user)).rejects.toThrow(BadRequestException);
      const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(stored.isPublic).toBe(false);
      expect(await prisma.activity.count()).toBe(0);
    });
  });
});
