import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  PayloadTooLargeException,
  Logger,
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

/** Attachment metadata shape used in task/comment/document payloads. */
export interface AttachmentMeta {
  id: string;
  subjectType: string;
  subjectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: string | null;
  createdAt: Date;
}

/**
 * Attach attachment metadata to payload rows.
 *
 * The Attachment model links subjects by (subjectType, subjectId) strings —
 * there is no typed relation, so Prisma includes cannot cross it. Instead the
 * metadata is fetched in one query over all subject ids and grouped here.
 */
export async function hydrateAttachments<T extends { id: string }>(
  prisma: PrismaService,
  rows: T[],
  subjectType: SubjectType,
): Promise<(T & { attachments: AttachmentMeta[] })[]> {
  if (rows.length === 0) return [];
  const metas: AttachmentMeta[] = await prisma.attachment.findMany({
    where: { subjectType, subjectId: { in: rows.map((r) => r.id) } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      subjectType: true,
      subjectId: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      uploaderId: true,
      createdAt: true,
    },
  });
  const bySubject = new Map<string, AttachmentMeta[]>();
  for (const m of metas) {
    const list = bySubject.get(m.subjectId);
    if (list) list.push(m);
    else bySubject.set(m.subjectId, [m]);
  }
  return rows.map((r) => ({ ...r, attachments: bySubject.get(r.id) ?? [] }));
}

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
  private readonly logger = new Logger(AttachmentsService.name);

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
      ? JSON.parse(s.allowedMimeTypes).map((mime: string) => mime.toLowerCase())
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
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

    let size: number;
    if (input.content) {
      size = input.content.byteLength;
      if (size > MCP_MAX_BYTES) {
        throw new PayloadTooLargeException('MCP uploads are capped at 1 MiB');
      }
      if (size > maxFileSizeMb * 1024 * 1024) {
        throw new BadRequestException('File exceeds max size');
      }
    } else if (input.tempPath) {
      const s = await fs.stat(input.tempPath);
      size = s.size;
      if (size > maxFileSizeMb * 1024 * 1024) {
        await fs.rm(input.tempPath, { force: true });
        throw new BadRequestException('File exceeds max size');
      }
    } else {
      throw new BadRequestException('No file provided');
    }

    const safeName = sanitizeFilename(filename);
    const storageKey = `${randomUUID()}${extensionOf(safeName)}`;

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
      } catch (err) {
        await this.prisma.attachment.delete({ where: { id: att.id } }).catch(() => undefined);
        throw err;
      } finally {
        await fs.rm(staged, { force: true });
      }
    } else {
      try {
        await this.driver.put(storageKey, input.tempPath);
      } catch (err) {
        await this.prisma.attachment.delete({ where: { id: att.id } }).catch(() => undefined);
        throw err;
      }
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
    await this.driver.delete(att.storageKey).catch((err) => {
      this.logger.error(
        `Failed to delete storage object ${att.storageKey} for attachment ${id}: ${err?.message ?? err}`,
      );
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

  async findForDownload(id: string) {
    const att = await this.prisma.attachment.findUnique({ where: { id } });
    if (!att) throw new NotFoundException('Attachment not found');
    return att;
  }

  async readBytes(id: string): Promise<Buffer> {
    const att = await this.findForDownload(id);
    try {
      return await this.driver.get(att.storageKey);
    } catch {
      throw new NotFoundException('Attachment object missing');
    }
  }

  async removeBySubject(subjectType: SubjectType, subjectId: string) {
    const rows = await this.prisma.attachment.findMany({
      where: { subjectType, subjectId },
    });
    if (rows.length === 0) return;
    await this.prisma.attachment.deleteMany({ where: { subjectType, subjectId } });
    await Promise.all(
      rows.map((r) =>
        this.driver.delete(r.storageKey).catch((err) => {
          this.logger.error(
            `Failed to delete storage object ${r.storageKey} for attachment ${r.id}: ${err?.message ?? err}`,
          );
        }),
      ),
    );
  }

  /**
   * Full cleanup for a task: its own attachment rows plus those of its comments
   * and documents, whose rows would otherwise survive SQLite's cascade when the
   * task row is deleted (Attachment has no FK across the string subject pair).
   */
  async removeByTask(taskId: string) {
    const commentIds = (
      await this.prisma.comment.findMany({ where: { taskId }, select: { id: true } })
    ).map((c) => c.id);
    const docIds = (
      await this.prisma.document.findMany({ where: { taskId }, select: { id: true } })
    ).map((d) => d.id);
    await this.removeBySubject('task', taskId);
    await Promise.all([
      ...commentIds.map((id) => this.removeBySubject('comment', id)),
      ...docIds.map((id) => this.removeBySubject('document', id)),
    ]);
  }

  /** Cleanup for a whole board: per-task cleanup before the bare board delete. */
  async removeByBoard(boardId: string) {
    const tasks = await this.prisma.task.findMany({ where: { boardId }, select: { id: true } });
    for (const t of tasks) await this.removeByTask(t.id);
  }
}
