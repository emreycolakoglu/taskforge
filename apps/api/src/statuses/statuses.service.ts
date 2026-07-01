import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateStatusDto, UpdateStatusDto, ReorderStatusesDto } from './dto/status.dto';

@Injectable()
export class StatusesService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
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

  async create(dto: CreateStatusDto, _user?: { id: string; displayName: string }) {
    const maxPos = await this.prisma.status.aggregate({
      where: { boardId: dto.boardId },
      _max: { position: true },
    });
    const status = await this.prisma.status.create({
      data: {
        boardId: dto.boardId,
        name: dto.name,
        position: dto.position ?? (maxPos._max.position ?? -1) + 1,
        color: dto.color,
        wipLimit: dto.wipLimit,
      },
    });
    this.events.emit('status:created', status, dto.boardId);
    return status;
  }

  async update(id: string, dto: UpdateStatusDto, _user?: { id: string; displayName: string }) {
    await this.findOne(id);
    const status = await this.prisma.status.update({ where: { id }, data: dto });
    this.events.emit('status:updated', status, status.boardId);
    return status;
  }

  async reorder(dto: ReorderStatusesDto) {
    const updates = dto.items.map((item) =>
      this.prisma.status.update({ where: { id: item.id }, data: { position: item.position } }),
    );
    const result = await this.prisma.$transaction(updates);
    const boardId = dto.items.length > 0 ? (await this.prisma.status.findUnique({ where: { id: dto.items[0].id } }))?.boardId : undefined;
    this.events.emit('status:reordered', result, boardId);
    return result;
  }

  async remove(id: string, _user?: { id: string; displayName: string }) {
    const status = await this.findOne(id);
    await this.prisma.status.delete({ where: { id } });
    this.events.emit('status:deleted', { id }, status.boardId);
  }

  async toggleDone(statusId: string, _user?: { id: string; displayName: string }) {
    const target = await this.findOne(statusId);
    const boardId = target.boardId;
    await this.prisma.$transaction(async (tx) => {
      const prevDone = await tx.status.findFirst({ where: { boardId, isDone: true } });
      if (prevDone && prevDone.id !== statusId) {
        await tx.status.update({ where: { id: prevDone.id }, data: { isDone: false } });
        await tx.task.updateMany({ where: { statusId: prevDone.id }, data: { doneAt: null } });
      }
      await tx.status.update({ where: { id: statusId }, data: { isDone: true } });
      await tx.task.updateMany({ where: { statusId, doneAt: null }, data: { doneAt: new Date() } });
    });
    const status = await this.findOne(statusId);
    this.events.emit('status:doneToggled', status, boardId);
    return status;
  }

  async unsetDone(boardId: string, _user?: { id: string; displayName: string }) {
    const done = await this.prisma.status.findFirst({ where: { boardId, isDone: true } });
    if (!done) return { unset: true };
    await this.prisma.$transaction(async (tx) => {
      await tx.status.update({ where: { id: done.id }, data: { isDone: false } });
      await tx.task.updateMany({ where: { statusId: done.id }, data: { doneAt: null } });
    });
    const refreshed = await this.findOne(done.id);
    this.events.emit('status:doneToggled', refreshed, boardId);
    return { unset: true };
  }
}
