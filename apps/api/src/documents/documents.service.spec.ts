import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { MembersService } from '../members/members.service';
import { LocalDiskDriver } from '../storage/local-disk.driver';
import { createTestPrisma, seedBoard, seedTask, seedDocument, seedUser } from '../../test/setup';

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
      const d1 = await service.create(task.id, { title: 'First', body: 'a' }, user);
      const d2 = await service.create(task.id, { title: 'Second' }, user);
      expect(d1.number).toBe(1);
      expect(d1.docNumber).toBe('D-1');
      expect(d2.number).toBe(2);
      expect(d2.docNumber).toBe('D-2');
      const refreshed = await prisma.board.findUniqueOrThrow({ where: { id: board.id } });
      expect(refreshed.nextDocNum).toBe(3);
    });

    it('writes doc_created activity on the task', async () => {
      await service.create(task.id, { title: 'Spec' }, user);
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
});
