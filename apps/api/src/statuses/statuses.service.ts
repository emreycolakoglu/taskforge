import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { MembersService } from '../members/members.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { CreateStatusDto, UpdateStatusDto, ReorderStatusesDto } from './dto/status.dto';
import { STATUS_TYPES, defaultProgressForType } from './status-types';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Injectable()
export class StatusesService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private members: MembersService,
    private attachments: AttachmentsService,
  ) {}

  async findByBoard(boardId: string) {
    return this.prisma.status.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
      include: { _count: { select: { tasks: true } } },
    });
  }

  async findOne(id: string) {
    const status = await this.prisma.status.findUnique({ where: { id } });
    if (!status) throw new NotFoundException('Status not found');
    return status;
  }

  async create(dto: CreateStatusDto, user?: AuthedUser) {
    await this.assertBoardAdmin(dto.boardId, user, 'create statuses');
    if (!dto.type || !STATUS_TYPES.includes(dto.type as any)) {
      throw new BadRequestException(`Invalid status type "${dto.type}"`);
    }
    const maxPos = await this.prisma.status.aggregate({
      where: { boardId: dto.boardId },
      _max: { position: true },
    });
    const status = await this.prisma.status.create({
      data: {
        boardId: dto.boardId,
        name: dto.name,
        type: dto.type,
        position: dto.position ?? (maxPos._max.position ?? -1) + 1,
        color: dto.color,
        // Anchor first (type default), then spread across the new sibling group.
        progress: defaultProgressForType(dto.type),
      },
    });
    await this.recomputeProgress(dto.boardId, dto.type);
    this.events.emit('status:created', status, dto.boardId);
    // The recompute spread may have adjusted this status's own progress — refetch.
    return this.findOne(status.id);
  }

  async update(id: string, dto: UpdateStatusDto, user?: AuthedUser) {
    const existing = await this.findOne(id);
    await this.assertBoardAdmin(existing.boardId, user, 'update statuses');

    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.color !== undefined) data.color = dto.color;

    // Progress is server-managed (Linear-style position spread) — any
    // client-supplied progress in the payload is deliberately ignored.

    const typeChanged = dto.type !== undefined && dto.type !== existing.type;
    const positionChanged = dto.position !== undefined && dto.position !== existing.position;
    if (typeChanged) {
      data.type = dto.type;
      // Anchor to the type default before the sibling spread recomputes it.
      data.progress = defaultProgressForType(dto.type);
    }

    const status = await this.prisma.status.update({ where: { id }, data });
    if (typeChanged || positionChanged) {
      // Both the old and new type groups can shift when a status changes type.
      await this.recomputeProgress(existing.boardId, existing.type);
      if (typeChanged) await this.recomputeProgress(existing.boardId, dto.type);
    }
    this.events.emit('status:updated', status, status.boardId);
    if (typeChanged || positionChanged) {
      // Broadcast the recomputed siblings too — payloads embed status.progress.
      const boardId = status.boardId;
      const siblings = await this.prisma.status.findMany({ where: { boardId } });
      this.events.emit('status:updated', siblings, boardId);
    }
    // The recompute spread may have adjusted this status's own progress — refetch.
    return this.findOne(id);
  }

  async reorder(dto: ReorderStatusesDto, user?: AuthedUser) {
    const boardId =
      dto.items.length > 0
        ? (await this.prisma.status.findUnique({ where: { id: dto.items[0].id } }))?.boardId
        : undefined;
    if (boardId) {
      await this.assertBoardAdmin(boardId, user, 'reorder statuses');
    }
    const updates = dto.items.map((item) =>
      this.prisma.status.update({ where: { id: item.id }, data: { position: item.position } }),
    );
    const result = await this.prisma.$transaction(updates);
    // Reordering any status can change every same-type sibling's progress.
    await this.recomputeProgress(boardId);
    const refreshed = await this.prisma.status.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
    });
    this.events.emit('status:reordered', refreshed, boardId);
    return refreshed;
  }

  async remove(id: string, user?: AuthedUser) {
    const status = await this.findOne(id);
    await this.assertBoardAdmin(status.boardId, user, 'delete statuses');
    // Attachment cleanup before the delete: status removal cascades its tasks
    // at the DB level, which would otherwise orphan their attachment rows.
    const tasks = await this.prisma.task.findMany({
      where: { statusId: id },
      select: { id: true, projectId: true },
    });
    for (const task of tasks) await this.attachments.removeByTask(task.id);
    await this.prisma.status.delete({ where: { id } });
    this.events.emit('status:deleted', { id }, status.boardId);
    // Project pages hold no board room — tell them which linked tasks vanished.
    for (const task of tasks) {
      if (task.projectId === null) continue;
      this.events.emit('task.project.updated', {
        id: task.id,
        boardId: status.boardId,
        projectId: null,
        previousProjectId: task.projectId,
      });
    }
    // Survivors of the deleted status's type group shift a step.
    await this.recomputeProgress(status.boardId, status.type);
  }

  /**
   * Recompute progress for every status on a board (or one type), Linear-style:
   * ONLY in_progress statuses participate in the sibling spread — within the
   * type group ordered by position, progress is round(((index + 0.5) / n) * 100),
   * never 0 or 100. Every other type keeps its fixed anchor (triage/backlog/todo
   * 0, done 100, cancelled/duplicate null) regardless of position or count.
   */
  private async recomputeProgress(boardId: string, type?: string) {
    if (type && type !== 'in_progress') return;
    const statuses = await this.prisma.status.findMany({
      where: { boardId, type: 'in_progress' },
      orderBy: { position: 'asc' },
    });
    const n = statuses.length;
    if (n === 0) return;
    const updates = statuses.map((status, i) =>
      this.prisma.status.update({
        where: { id: status.id },
        data: { progress: Math.round(((i + 0.5) / n) * 100) },
      }),
    );
    await this.prisma.$transaction(updates);
  }

  private async assertBoardAdmin(boardId: string, user: AuthedUser | undefined, action: string) {
    if (!user?.id) throw new ForbiddenException('Admin access required');
    const isAdmin = await this.members.isBoardAdmin(boardId, user.id);
    if (!isAdmin) throw new ForbiddenException(`Only board admins can ${action}`);
  }
}
