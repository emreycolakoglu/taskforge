import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AttachmentsService, hydrateAttachments } from '../attachments/attachments.service';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';

export function withDocNumber(doc: any): any {
  const identifier = doc.board?.identifier;
  return {
    ...doc,
    // Project docs have no board; their number is project-scoped but still
    // displays as plain `D-<n>`.
    docNumber: identifier || doc.projectId ? `D-${doc.number}` : null,
  };
}

/**
 * A document hangs off exactly one subject: a task (board-numbered, logs
 * Activity on the task) or a project (project-numbered, boardId/taskId null,
 * no Activity — Activity.taskId is required).
 */
export interface DocumentSubject {
  taskId?: string;
  projectId?: string;
}

const projectSelect = { select: { id: true, name: true, icon: true } };

const subjectInclude = {
  board: { select: { identifier: true } },
  task: { select: { id: true, number: true, title: true } },
  project: projectSelect,
};

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private attachments: AttachmentsService,
  ) {}

  private actorInfo(user?: { id: string; displayName: string }) {
    return { actorId: user?.id ?? null, actor: user?.displayName ?? 'system' };
  }

  async findByBoard(boardId: string) {
    const docs = await this.prisma.document.findMany({
      where: { boardId },
      include: subjectInclude,
      orderBy: { updatedAt: 'desc' },
    });
    const stripped = docs.map(({ body, ...d }) =>
      withDocNumber({ ...d, taskNumber: `${d.board?.identifier ?? ''}-${d.task?.number}` }),
    );
    return hydrateAttachments(this.prisma, stripped, 'document');
  }

  async findByTask(taskId: string) {
    const docs = await this.prisma.document.findMany({
      where: { taskId },
      include: subjectInclude,
      orderBy: { createdAt: 'desc' },
    });
    const stripped = docs.map(({ body, ...d }) => withDocNumber(d));
    return hydrateAttachments(this.prisma, stripped, 'document');
  }

  async findByProject(projectId: string) {
    const docs = await this.prisma.document.findMany({
      where: { projectId },
      include: subjectInclude,
      orderBy: { createdAt: 'desc' },
    });
    const stripped = docs.map(({ body, ...d }) => withDocNumber(d));
    return hydrateAttachments(this.prisma, stripped, 'document');
  }

  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: subjectInclude,
    });
    if (!doc) throw new NotFoundException('Document not found');
    const shaped = withDocNumber({
      ...doc,
      boardIdentifier: doc.board?.identifier ?? null,
      taskNumber: doc.task ? `${doc.board.identifier}-${doc.task.number}` : null,
      taskTitle: doc.task?.title ?? null,
    });
    const [hydrated] = await hydrateAttachments(this.prisma, [shaped], 'document');
    return hydrated;
  }

  async create(
    subject: DocumentSubject,
    dto: CreateDocumentDto,
    user?: { id: string; displayName: string },
  ) {
    const { taskId, projectId } = subject;
    if (taskId && projectId) {
      throw new BadRequestException('Attach the document to a task or a project, not both');
    }
    if (!taskId && !projectId) {
      throw new BadRequestException('A document needs a task or a project');
    }
    if (projectId) return this.createForProject(projectId, dto);

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

  private async createForProject(projectId: string, dto: CreateDocumentDto) {
    const doc = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundException('Project not found');
      await tx.project.update({
        where: { id: projectId },
        data: { nextDocNum: project.nextDocNum + 1 },
      });
      return tx.document.create({
        data: {
          projectId,
          number: project.nextDocNum,
          title: dto.title,
          body: dto.body ?? '',
        },
        include: { project: projectSelect },
      });
    });

    // Projects are workspace-level: no board room to scope to, so broadcast.
    this.events.emit('document:created', doc);
    return withDocNumber(doc);
  }

  async update(id: string, dto: UpdateDocumentDto, user?: { id: string; displayName: string }) {
    const existing = await this.prisma.document.findUnique({
      where: { id },
      include: { board: { select: { identifier: true } }, project: projectSelect },
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
      include: { board: { select: { identifier: true } }, project: projectSelect },
    });

    if (existing.taskId) {
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
    }

    this.events.emit('document:updated', doc, doc.boardId ?? undefined);
    return withDocNumber(doc);
  }

  async remove(id: string, user?: { id: string; displayName: string }) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    const { actorId, actor } = this.actorInfo(user);

    await this.prisma.document.delete({ where: { id } });
    await this.attachments?.removeBySubject('document', id);

    if (doc.taskId) {
      await this.prisma.activity.create({
        data: {
          taskId: doc.taskId,
          actorId,
          actor,
          action: 'doc_deleted',
          detail: JSON.stringify({ title: doc.title }),
        },
      });
    }

    this.events.emit(
      'document:deleted',
      { id, boardId: doc.boardId, taskId: doc.taskId, projectId: doc.projectId },
      doc.boardId ?? undefined,
    );
  }

  async setPublic(id: string, isPublic: boolean, user?: { id: string; displayName: string }) {
    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Document not found');
    // The public route is addressed by board identifier + doc number; a
    // project doc has neither a board nor a public address.
    if (!existing.boardId) {
      throw new BadRequestException('Project documents cannot be published');
    }

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
