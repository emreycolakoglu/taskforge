import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { basename, join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { MembersService } from '../members/members.service';
import {
  STORAGE_DRIVER,
  StorageDriver,
  DEFAULT_ALLOWED_MIME_TYPES,
} from '../storage/storage.types';

export type SubjectType = 'task' | 'comment' | 'document';

export const SUBJECT_TYPES: SubjectType[] = ['task', 'comment', 'document'];

/** Max decoded payload accepted over MCP (base64 field). */
export const MCP_MAX_BYTES = 1024 * 1024;

function sanitizeFilename(raw: string): string {
  const base = basename(raw ?? '');
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
  return cleaned || 'untitled';
}

function extensionOf(filename: string): string {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
  return /^(\.[a-z0-9]+){1,3}$/i.test(ext) ? ext.toLowerCase() : '';
}

interface SubjectContext {
  boardId: string;
  taskId: string | null;
}

interface Actor {
  id: string;
  displayName?: string;
  role: string;
}

@Injectable()
export class AttachmentsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private members: MembersService,
    @Inject(STORAGE_DRIVER) private driver: StorageDriver,
  ) {}

  async assertSubject(subjectType: SubjectType, subjectId: string): Promise<SubjectContext> {
    if (!SUBJECT_TYPES.includes(subjectType)) {
      throw new NotFoundException('Unknown subject type');
    }
    if (subjectType === 'task') {
      const task = await this.prisma.task.findUnique({ where: { id: subjectId } });
      if (!task) throw new NotFoundException('Task not found');
      return { boardId: task.boardId, taskId: task.id };
    }
    if (subjectType === 'comment') {
      const comment = await this.prisma.comment.findUnique({ where: { id: subjectId } });
      if (!comment) throw new NotFoundException('Comment not found');
      const task = await this.prisma.task.findUnique({ where: { id: comment.taskId } });
      if (!task) throw new NotFoundException('Task not found');
      return { boardId: task.boardId, taskId: task.id };
    }
    const doc = await this.prisma.document.findUnique({ where: { id: subjectId } });
    if (!doc) throw new NotFoundException('Document not found');
    return { boardId: doc.boardId, taskId: doc.taskId };
  }

  private async loadSettings() {
    const s = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    const allowed = s?.allowedMimeTypes
      ? JSON.parse(s.allowedMimeTypes)
      : DEFAULT_ALLOWED_MIME_TYPES;
    return { maxFileSizeMb: s?.maxFileSizeMb ?? 10, allowedMimeTypes: allowed };
  }

  private async assertCanWrite(boardId: string, user?: Actor) {
    if (!user?.id) throw new ForbiddenException('Authentication required');
    if (user.role === 'admin') return;
    const members = await this.prisma.member.findMany({ where: { boardId } });
    if (members.length === 0) return; // legacy board fallback
    const member = members.find((m) => m.userId === user.id);
    if (!member || member.role === 'viewer') {
      throw new ForbiddenException('Viewer role cannot manage attachments');
    }
  }

  private async assertCanDelete(boardId: string, att, user?: Actor) {
    if (!user?.id) throw new ForbiddenException('Authentication required');
    if (att.uploaderId === user.id) return;
    if (user.role === 'admin') return;
    const isAdmin = await this.members.isBoardAdmin(boardId, user.id);
    if (isAdmin) return;
    throw new ForbiddenException('You can only delete your own attachments');
  }

  private toMeta(att) {
    const { storageKey, ...rest } = att;
    return {
      ...rest,
      uploader: att.uploader
        ? { id: att.uploader.id, displayName: att.uploader.displayName }
        : null,
    };
  }

  async list(subjectType: SubjectType, subjectId: string) {
    await this.assertSubject(subjectType, subjectId);
    const rows = await this.prisma.attachment.findMany({
      where: { subjectType, subjectId },
      include: { uploader: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((a) => this.toMeta(a));
  }

  async create(input: {
    subjectType: SubjectType;
    subjectId: string;
    filename: string;
    mimeType: string;
    tempPath?: string;
    content?: Buffer;
    user?: Actor;
  }) {
    const { subjectType, subjectId, filename, mimeType } = input;
    const ctx = await this.assertSubject(subjectType, subjectId);
    await this.assertCanWrite(ctx.boardId, input.user);

    const { maxFileSizeMb, allowedMimeTypes } = await this.loadSettings();
    const mime = (mimeType || 'application/octet-stream').toLowerCase().split(';')[0].trim();
    if (!allowedMimeTypes.includes(mime)) {
      throw new BadRequestException(`MIME type not allowed: ${mime}`);
    }

    if (input.content) {
      if (input.content.byteLength > MCP_MAX_BYTES) {
        throw new PayloadTooLargeException('MCP uploads are capped at 1 MiB');
      }
      if (input.content.byteLength > maxFileSizeMb * 1024 * 1024) {
        throw new BadRequestException('File exceeds max size');
      }
    } else if (input.tempPath) {
      const s = await fs.stat(input.tempPath);
      if (s.size > maxFileSizeMb * 1024 * 1024) {
        await fs.rm(input.tempPath, { force: true });
        throw new BadRequestException('File exceeds max size');
      }
    } else {
      throw new BadRequestException('No file provided');
    }

    const safeName = sanitizeFilename(filename);
    const storageKey = `${randomUUID()}${extensionOf(safeName)}`;

    const size = input.content ? input.content.byteLength : (await fs.stat(input.tempPath)).size;

    const att = await this.prisma.attachment.create({
      data: {
        subjectType,
        subjectId,
        filename: safeName,
        mimeType: mime,
        sizeBytes: size,
        storageKey,
        uploaderId: input.user?.id ?? null,
      },
      include: { uploader: { select: { id: true, displayName: true } } },
    });

    if (input.content) {
      // MCP path: stage then rename so both paths share the driver contract.
      const staged = join(tmpdir(), `tf-mcp-${storageKey}`);
      await fs.writeFile(staged, input.content);
      try {
        await this.driver.put(storageKey, staged);
      } finally {
        await fs.rm(staged, { force: true });
      }
    } else {
      await this.driver.put(storageKey, input.tempPath);
    }

    if (ctx.taskId) {
      await this.prisma.activity.create({
        data: {
          taskId: ctx.taskId,
          actorId: input.user?.id ?? null,
          actor: input.user?.displayName ?? 'system',
          action: 'attachment_added',
          detail: JSON.stringify({ filename: safeName, sizeBytes: size }),
        },
      });
    }

    this.events.emit('attachment:created', this.toMeta(att), ctx.boardId);
    return this.toMeta(att);
  }

  async remove(id: string, user?: Actor) {
    const att = await this.prisma.attachment.findUnique({
      where: { id },
      include: { uploader: { select: { id: true, displayName: true } } },
    });
    if (!att) throw new NotFoundException('Attachment not found');
    const ctx = await this.assertSubject(att.subjectType as SubjectType, att.subjectId);
    await this.assertCanDelete(ctx.boardId, att, user);

    await this.prisma.attachment.delete({ where: { id } });
    await this.driver.delete(att.storageKey).catch(() => {
      // best-effort: row is gone, a dangling object is harmless
    });

    if (ctx.taskId) {
      await this.prisma.activity.create({
        data: {
          taskId: ctx.taskId,
          actorId: user?.id ?? null,
          actor: user?.displayName ?? 'system',
          action: 'attachment_removed',
          detail: JSON.stringify({ filename: att.filename, sizeBytes: att.sizeBytes }),
        },
      });
    }

    this.events.emit(
      'attachment:deleted',
      { id, subjectType: att.subjectType, subjectId: att.subjectId },
      ctx.boardId,
    );
  }

  async removeBySubject(subjectType: SubjectType, subjectId: string) {
    const rows = await this.prisma.attachment.findMany({
      where: { subjectType, subjectId },
    });
    if (rows.length === 0) return;
    await this.prisma.attachment.deleteMany({ where: { subjectType, subjectId } });
    await Promise.all(rows.map((r) => this.driver.delete(r.storageKey).catch(() => undefined)));
  }
}
