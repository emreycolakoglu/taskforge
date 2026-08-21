import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';

export function withDocNumber(doc: any): any {
  const identifier = doc.board?.identifier;
  return {
    ...doc,
    docNumber: identifier ? `D-${doc.number}` : null,
  };
}

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  private actorInfo(user?: { id: string; displayName: string }) {
    return { actorId: user?.id ?? null, actor: user?.displayName ?? 'system' };
  }

  async findByBoard(boardId: string) {
    const docs = await this.prisma.document.findMany({
      where: { boardId },
      include: {
        board: { select: { identifier: true } },
        task: { select: { id: true, number: true, title: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return docs.map(({ body, ...d }) =>
      withDocNumber({ ...d, taskNumber: `${d.board?.identifier ?? ''}-${d.task?.number}` }),
    );
  }

  async findByTask(taskId: string) {
    const docs = await this.prisma.document.findMany({
      where: { taskId },
      include: {
        board: { select: { identifier: true } },
        task: { select: { id: true, number: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map(({ body, ...d }) => withDocNumber(d));
  }

  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: {
        board: { select: { identifier: true } },
        task: { select: { id: true, number: true, title: true } },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return withDocNumber({
      ...doc,
      boardIdentifier: doc.board.identifier,
      taskNumber: `${doc.board.identifier}-${doc.task.number}`,
      taskTitle: doc.task.title,
    });
  }

  async create(taskId: string, dto: CreateDocumentDto, user?: { id: string; displayName: string }) {
    const { actorId, actor } = this.actorInfo(user);
    const doc = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: { board: { select: { identifier: true, nextDocNum: true } } },
      });
      const docNumber = task.board.nextDocNum;
      await tx.board.update({
        where: { id: task.boardId },
        data: { nextDocNum: docNumber + 1 },
      });
      return tx.document.create({
        data: {
          boardId: task.boardId,
          taskId,
          number: docNumber,
          title: dto.title,
          body: dto.body ?? '',
        },
        include: { board: { select: { identifier: true } } },
      });
    });

    await this.prisma.activity.create({
      data: {
        taskId,
        actorId,
        actor,
        action: 'doc_created',
        detail: JSON.stringify({ title: dto.title }),
      },
    });

    this.events.emit('document:created', doc, doc.boardId);
    return withDocNumber(doc);
  }

  async update(id: string, dto: UpdateDocumentDto, user?: { id: string; displayName: string }) {
    const existing = await this.prisma.document.findUnique({
      where: { id },
      include: { board: { select: { identifier: true } } },
    });
    if (!existing) throw new NotFoundException('Document not found');

    const changes: Record<string, any> = {};
    if (dto.title !== undefined && dto.title !== existing.title) changes.title = dto.title;
    if (dto.body !== undefined && dto.body !== existing.body) changes.body = dto.body;
    const changed = Object.keys(changes).length > 0;

    if (!changed) return withDocNumber(existing);

    const doc = await this.prisma.document.update({
      where: { id },
      data: changes,
      include: { board: { select: { identifier: true } } },
    });

    const { actorId, actor } = this.actorInfo(user);
    await this.prisma.activity.create({
      data: {
        taskId: existing.taskId,
        actorId,
        actor,
        action: 'doc_updated',
        detail: JSON.stringify({ title: doc.title }),
      },
    });

    this.events.emit('document:updated', doc, doc.boardId);
    return withDocNumber(doc);
  }

  async remove(id: string, user?: { id: string; displayName: string }) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    const { actorId, actor } = this.actorInfo(user);

    await this.prisma.document.delete({ where: { id } });

    await this.prisma.activity.create({
      data: {
        taskId: doc.taskId,
        actorId,
        actor,
        action: 'doc_deleted',
        detail: JSON.stringify({ title: doc.title }),
      },
    });

    this.events.emit(
      'document:deleted',
      { id, boardId: doc.boardId, taskId: doc.taskId },
      doc.boardId,
    );
  }

  async setPublic(id: string, isPublic: boolean, user?: { id: string; displayName: string }) {
    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Document not found');

    if (existing.isPublic === isPublic) {
      const unchanged = await this.prisma.document.findUniqueOrThrow({
        where: { id },
        include: { board: { select: { identifier: true } } },
      });
      return withDocNumber({
        ...unchanged,
        boardIdentifier: unchanged.board.identifier,
      });
    }

    const doc = await this.prisma.document.update({
      where: { id },
      data: { isPublic },
      include: { board: { select: { identifier: true } } },
    });

    const { actorId, actor } = this.actorInfo(user);
    await this.prisma.activity.create({
      data: {
        taskId: existing.taskId,
        actorId,
        actor,
        action: isPublic ? 'published' : 'unpublished',
        detail: JSON.stringify({ title: doc.title }),
      },
    });

    this.events.emit('document:updated', doc, doc.boardId);
    return withDocNumber({
      ...doc,
      boardIdentifier: doc.board.identifier,
    });
  }
}
