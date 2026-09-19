import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { MembersService } from '../members/members.service';
import { STORAGE_DRIVER } from '../storage/storage.types';
import { LocalDiskDriver } from '../storage/local-disk.driver';
import {
  createTestPrisma,
  seedBoard,
  seedTask,
  seedComment,
  seedDocument,
  seedUser,
  seedAttachment,
} from '../../test/setup';

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let prisma: PrismaService;
  let events: EventsService;
  let driver: LocalDiskDriver;
  let storageRoot: string;
  let board: any;
  let task: any;
  let memberUser: any;
  let viewerUser: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    storageRoot = mkdtempSync(join(tmpdir(), 'tf-att-'));
    driver = new LocalDiskDriver(storageRoot);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        MembersService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
        { provide: STORAGE_DRIVER, useValue: driver },
      ],
    }).compile();
    service = module.get<AttachmentsService>(AttachmentsService);
  });

  afterAll(async () => {
    rmSync(storageRoot, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    task = await seedTask(prisma, board.statuses[0].id);
    memberUser = await seedUser(prisma);
    viewerUser = await seedUser(prisma, { email: `v${Date.now()}@test.dev` });
    await prisma.member.create({
      data: { boardId: board.id, userId: memberUser.id, role: 'member' },
    });
    await prisma.member.create({
      data: { boardId: board.id, userId: viewerUser.id, role: 'viewer' },
    });
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
    await prisma.settings.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
  });

  const stagedFile = (content: string) => {
    const p = join(tmpdir(), `tf-stage-${Date.now()}-${Math.random()}.txt`);
    writeFileSync(p, content);
    return p;
  };

  describe('create', () => {
    it('uploads to a task with a temp file (member, non-viewer)', async () => {
      const temp = stagedFile('hello');
      const att = await service.create({
        subjectType: 'task',
        subjectId: task.id,
        filename: 'notes.txt',
        mimeType: 'text/plain',
        tempPath: temp,
        user: { id: memberUser.id, displayName: memberUser.displayName, role: 'member' },
      });
      expect(att.subjectType).toBe('task');
      expect(att.filename).toBe('notes.txt');
      expect(att.mimeType).toBe('text/plain');
      expect(att.sizeBytes).toBe(5);
      expect(att.storageKey).toBeUndefined();
      // object landed in storage
      const row = await prisma.attachment.findUnique({ where: { id: att.id } });
      expect(await driver.get(row.storageKey)).toEqual(Buffer.from('hello'));
      // activity + event
      const acts = await prisma.activity.findMany({ where: { action: 'attachment_added' } });
      expect(acts).toHaveLength(1);
      expect(JSON.parse(acts[0].detail)).toEqual({ filename: 'notes.txt', sizeBytes: 5 });
    });

    it('uploads via content buffer (MCP path)', async () => {
      const att = await service.create({
        subjectType: 'task',
        subjectId: task.id,
        filename: 'b.txt',
        mimeType: 'text/plain',
        content: Buffer.from('abc'),
        user: { id: memberUser.id, displayName: memberUser.displayName, role: 'member' },
      });
      expect(att.sizeBytes).toBe(3);
    });

    it('rejects content over the 1 MiB MCP cap (413)', async () => {
      await expect(
        service.create({
          subjectType: 'task',
          subjectId: task.id,
          filename: 'big.txt',
          mimeType: 'text/plain',
          content: Buffer.alloc(1024 * 1024 + 1),
          user: { id: memberUser.id, displayName: 'M', role: 'member' },
        }),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('accepts content of exactly 1 MiB when no stricter settings row exists', async () => {
      const att = await service.create({
        subjectType: 'task',
        subjectId: task.id,
        filename: 'edge.txt',
        mimeType: 'text/plain',
        content: Buffer.alloc(1024 * 1024),
        user: { id: memberUser.id, displayName: 'M', role: 'member' },
      });
      expect(att.sizeBytes).toBe(1024 * 1024);
    });

    it('rejects content over a stricter settings.maxFileSizeMb', async () => {
      // maxFileSizeMb is Int ≥ 1, so a settings row cannot be stricter than the
      // 1 MiB MCP cap through normal settings UI; exercise the settings branch
      // of the content-path guard directly with an out-of-range row.
      await prisma.settings.create({
        data: { id: 'singleton', onboarded: true, maxFileSizeMb: 0 } as any,
      });
      await expect(
        service.create({
          subjectType: 'task',
          subjectId: task.id,
          filename: 'small-capped.txt',
          mimeType: 'text/plain',
          content: Buffer.from('tiny'),
          user: { id: memberUser.id, displayName: 'M', role: 'member' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('normalizes mimeType case and parameters', async () => {
      const att = await service.create({
        subjectType: 'task',
        subjectId: task.id,
        filename: 'n.txt',
        mimeType: 'TEXT/PLAIN; charset=utf-8',
        content: Buffer.from('z'),
        user: { id: memberUser.id, displayName: 'M', role: 'member' },
      });
      expect(att.mimeType).toBe('text/plain');
    });

    it('accepts a lowercase upload allowed by a persisted uppercase MIME allowlist', async () => {
      await prisma.settings.create({
        data: {
          id: 'singleton',
          onboarded: true,
          allowedMimeTypes: JSON.stringify(['TEXT/PLAIN']),
        },
      });

      await expect(
        service.create({
          subjectType: 'task',
          subjectId: task.id,
          filename: 'legacy.txt',
          mimeType: 'text/plain',
          content: Buffer.from('legacy'),
          user: { id: memberUser.id, displayName: 'M', role: 'member' },
        }),
      ).resolves.toMatchObject({ mimeType: 'text/plain' });
    });

    it('rejects create with neither tempPath nor content', async () => {
      await expect(
        service.create({
          subjectType: 'task',
          subjectId: task.id,
          filename: 'empty.txt',
          mimeType: 'text/plain',
          user: { id: memberUser.id, displayName: 'M', role: 'member' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rolls back the attachment row when storage.put fails', async () => {
      const failingDriver = {
        put: jest.fn().mockRejectedValue(new Error('disk full')),
        get: jest.fn(),
        delete: jest.fn(),
        stat: jest.fn(),
      };
      const module = await Test.createTestingModule({
        providers: [
          AttachmentsService,
          MembersService,
          { provide: PrismaService, useValue: prisma },
          { provide: EventsService, useValue: events },
          { provide: STORAGE_DRIVER, useValue: failingDriver },
        ],
      }).compile();
      const failingService = module.get<AttachmentsService>(AttachmentsService);

      await expect(
        failingService.create({
          subjectType: 'task',
          subjectId: task.id,
          filename: 'doomed.txt',
          mimeType: 'text/plain',
          content: Buffer.from('z'),
          user: { id: memberUser.id, displayName: 'M', role: 'member' },
        }),
      ).rejects.toThrow('disk full');

      expect(await prisma.attachment.findMany({ where: { subjectId: task.id } })).toHaveLength(0);
    });

    it('rejects viewer (403)', async () => {
      const temp = stagedFile('x');
      await expect(
        service.create({
          subjectType: 'task',
          subjectId: task.id,
          filename: 'a.txt',
          mimeType: 'text/plain',
          tempPath: temp,
          user: { id: viewerUser.id, displayName: 'V', role: 'member' },
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects anonymous', async () => {
      const temp = stagedFile('x');
      await expect(
        service.create({
          subjectType: 'task',
          subjectId: task.id,
          filename: 'a.txt',
          mimeType: 'text/plain',
          tempPath: temp,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects oversize against settings.maxFileSizeMb', async () => {
      await prisma.settings.create({
        data: { id: 'singleton', onboarded: true, maxFileSizeMb: 1 },
      });
      const temp = stagedFile('x'.repeat(1024 * 1024 + 1));
      await expect(
        service.create({
          subjectType: 'task',
          subjectId: task.id,
          filename: 'big.txt',
          mimeType: 'text/plain',
          tempPath: temp,
          user: { id: memberUser.id, displayName: 'M', role: 'member' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects mime not in allowlist', async () => {
      const temp = stagedFile('<svg/>');
      await expect(
        service.create({
          subjectType: 'task',
          subjectId: task.id,
          filename: 'x.svg',
          mimeType: 'image/svg+xml',
          tempPath: temp,
          user: { id: memberUser.id, displayName: 'M', role: 'member' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unknown subject type and missing subject (404)', async () => {
      const temp = stagedFile('x');
      await expect(
        service.create({
          subjectType: 'folder' as any,
          subjectId: 'x',
          filename: 'a.txt',
          mimeType: 'text/plain',
          tempPath: temp,
          user: { id: memberUser.id, displayName: 'M', role: 'member' },
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.create({
          subjectType: 'task',
          subjectId: 'missing',
          filename: 'a.txt',
          mimeType: 'text/plain',
          tempPath: temp,
          user: { id: memberUser.id, displayName: 'M', role: 'member' },
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('resolves comment subject through its task', async () => {
      const comment = await seedComment(prisma, task.id);
      const att = await service.create({
        subjectType: 'comment',
        subjectId: comment.id,
        filename: 'c.txt',
        mimeType: 'text/plain',
        content: Buffer.from('z'),
        user: { id: memberUser.id, displayName: 'M', role: 'member' },
      });
      expect(att.subjectType).toBe('comment');
    });

    it('resolves document subject to its board', async () => {
      const doc = await seedDocument(prisma, task.id);
      const att = await service.create({
        subjectType: 'document',
        subjectId: doc.id,
        filename: 'd.txt',
        mimeType: 'text/plain',
        content: Buffer.from('z'),
        user: { id: memberUser.id, displayName: 'M', role: 'member' },
      });
      expect(att.subjectType).toBe('document');
    });

    it('sanitizes path-traversal filenames', async () => {
      const att = await service.create({
        subjectType: 'task',
        subjectId: task.id,
        filename: '../../etc/passwd.txt',
        mimeType: 'text/plain',
        content: Buffer.from('z'),
        user: { id: memberUser.id, displayName: 'M', role: 'member' },
      });
      expect(att.filename).toBe('passwd.txt');
    });

    it('legacy board (no member rows) allows writes', async () => {
      // beforeEach seeds member rows; a legacy board has none, so clear them.
      await prisma.member.deleteMany();
      const temp = stagedFile('y');
      const att = await service.create({
        subjectType: 'task',
        subjectId: task.id,
        filename: 'l.txt',
        mimeType: 'text/plain',
        tempPath: temp,
        user: { id: viewerUser.id, displayName: 'V', role: 'member' },
      });
      expect(att.sizeBytes).toBe(1);
    });
  });

  describe('list', () => {
    it('returns metadata without storageKey, newest first', async () => {
      const older = new Date(Date.now() - 10000);
      await seedAttachment(prisma, 'task', task.id, { filename: 'one.txt', createdAt: older });
      await seedAttachment(prisma, 'task', task.id, { filename: 'two.txt', createdAt: new Date() });
      const list = await service.list('task', task.id);
      expect(list).toHaveLength(2);
      expect(list[0].filename).toBe('two.txt');
      expect(list[0].storageKey).toBeUndefined();
      expect(list[0].uploader).toBeDefined();
    });

    it('404s for unknown subject type', async () => {
      await expect(service.list('folder' as any, 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('uploader can delete; row and object disappear', async () => {
      const temp = stagedFile('bye');
      const att = await service.create({
        subjectType: 'task',
        subjectId: task.id,
        filename: 'd.txt',
        mimeType: 'text/plain',
        tempPath: temp,
        user: { id: memberUser.id, displayName: 'M', role: 'member' },
      });
      await service.remove(att.id, { id: memberUser.id, role: 'member' });
      expect(await prisma.attachment.findUnique({ where: { id: att.id } })).toBeNull();
      const acts = await prisma.activity.findMany({ where: { action: 'attachment_removed' } });
      expect(acts).toHaveLength(1);
    });

    it('board admin can delete someone else’s attachment', async () => {
      const temp = stagedFile('bye');
      const att = await service.create({
        subjectType: 'task',
        subjectId: task.id,
        filename: 'd.txt',
        mimeType: 'text/plain',
        tempPath: temp,
        user: { id: memberUser.id, displayName: 'M', role: 'member' },
      });
      // Plain user (not a global admin) holding a board-level admin Member row,
      // to prove the board-admin branch of assertCanDelete.
      const boardAdmin = await seedUser(prisma, { email: `ba${Date.now()}@test.dev` });
      await prisma.member.create({
        data: { boardId: board.id, userId: boardAdmin.id, role: 'admin' },
      });
      await expect(
        service.remove(att.id, { id: boardAdmin.id, role: 'member' }),
      ).resolves.toBeUndefined();
      expect(await prisma.attachment.findUnique({ where: { id: att.id } })).toBeNull();
    });

    it('random member cannot delete someone else’s attachment', async () => {
      const temp = stagedFile('bye');
      const att = await service.create({
        subjectType: 'task',
        subjectId: task.id,
        filename: 'd.txt',
        mimeType: 'text/plain',
        tempPath: temp,
        user: { id: memberUser.id, displayName: 'M', role: 'member' },
      });
      await expect(service.remove(att.id, { id: viewerUser.id, role: 'member' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('removeBySubject (cascade)', () => {
    it('removes rows and storage objects for a subject', async () => {
      const temp = stagedFile('c1');
      const att = await service.create({
        subjectType: 'task',
        subjectId: task.id,
        filename: 'c.txt',
        mimeType: 'text/plain',
        tempPath: temp,
        user: { id: memberUser.id, displayName: 'M', role: 'member' },
      });
      const row = await prisma.attachment.findUnique({ where: { id: att.id } });
      expect(await driver.stat(row.storageKey)).toEqual({ size: 2 });
      await service.removeBySubject('task', task.id);
      expect(
        await prisma.attachment.findMany({ where: { subjectType: 'task', subjectId: task.id } }),
      ).toHaveLength(0);
      expect(await driver.stat(row.storageKey)).toBeNull();
    });

    it('best-effort object delete: storage failure does not throw', async () => {
      await seedAttachment(prisma, 'task', task.id, { storageKey: 'ghost.txt' });
      await expect(service.removeBySubject('task', task.id)).resolves.toBeUndefined();
      expect(
        await prisma.attachment.findMany({ where: { subjectType: 'task', subjectId: task.id } }),
      ).toHaveLength(0);
    });
  });

  describe('removeByTask / removeByBoard (DB-cascade cleanup)', () => {
    it('removeByTask removes rows and objects for the task, its comments and documents', async () => {
      const comment = await seedComment(prisma, task.id);
      const doc = await seedDocument(prisma, task.id);
      const uploader = { id: memberUser.id, displayName: 'M', role: 'member' };
      const atts = [];
      for (const [subjectType, subjectId] of [
        ['task', task.id],
        ['comment', comment.id],
        ['document', doc.id],
      ] as const) {
        atts.push(
          await service.create({
            subjectType,
            subjectId,
            filename: `${subjectType}.txt`,
            mimeType: 'text/plain',
            content: Buffer.from('x'),
            user: uploader,
          }),
        );
      }
      const rows = [];
      for (const att of atts) {
        rows.push(await prisma.attachment.findUnique({ where: { id: att.id } }));
      }

      await service.removeByTask(task.id);

      for (const att of atts) {
        expect(await prisma.attachment.findUnique({ where: { id: att.id } })).toBeNull();
      }
      for (const row of rows) expect(await driver.stat(row.storageKey)).toBeNull();
    });

    it('removeByBoard removes attachments of every task on the board', async () => {
      const otherTask = await seedTask(prisma, board.statuses[1].id);
      const uploader = { id: memberUser.id, displayName: 'M', role: 'member' };
      const atts = [];
      for (const t of [task, otherTask]) {
        atts.push(
          await service.create({
            subjectType: 'task',
            subjectId: t.id,
            filename: `${t.id}.txt`,
            mimeType: 'text/plain',
            content: Buffer.from('x'),
            user: uploader,
          }),
        );
      }
      const rows = [];
      for (const att of atts) {
        rows.push(await prisma.attachment.findUnique({ where: { id: att.id } }));
      }

      await service.removeByBoard(board.id);

      for (const att of atts) {
        expect(await prisma.attachment.findUnique({ where: { id: att.id } })).toBeNull();
      }
      for (const row of rows) expect(await driver.stat(row.storageKey)).toBeNull();
    });

    it('removeByTask logs storage-delete failures instead of silently swallowing them', async () => {
      const failingDriver = {
        put: jest.fn(),
        get: jest.fn(),
        delete: jest.fn().mockRejectedValue(new Error('disk gone')),
        stat: jest.fn(),
      };
      const module = await Test.createTestingModule({
        providers: [
          AttachmentsService,
          MembersService,
          { provide: PrismaService, useValue: prisma },
          { provide: EventsService, useValue: events },
          { provide: STORAGE_DRIVER, useValue: failingDriver },
        ],
      }).compile();
      const failingService = module.get<AttachmentsService>(AttachmentsService);
      const loggerSpy = jest
        .spyOn((failingService as any).logger, 'error')
        .mockImplementation(() => undefined);

      await seedAttachment(prisma, 'task', task.id);
      await expect(failingService.removeByTask(task.id)).resolves.toBeUndefined();

      expect(loggerSpy).toHaveBeenCalled();
      loggerSpy.mockRestore();
    });
  });
});
