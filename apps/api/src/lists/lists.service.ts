import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateListDto, UpdateListDto, ReorderListsDto } from './dto/list.dto';

@Injectable()
export class ListsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async findByBoard(boardId: string) {
    return this.prisma.list.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
      include: { _count: { select: { tasks: true } } },
    });
  }

  async findOne(id: string) {
    const list = await this.prisma.list.findUnique({ where: { id } });
    if (!list) throw new NotFoundException('List not found');
    return list;
  }

  async create(dto: CreateListDto, _user?: { id: string; displayName: string }) {
    const maxPos = await this.prisma.list.aggregate({
      where: { boardId: dto.boardId },
      _max: { position: true },
    });
    const list = await this.prisma.list.create({
      data: {
        boardId: dto.boardId,
        name: dto.name,
        position: dto.position ?? (maxPos._max.position ?? -1) + 1,
        color: dto.color,
        wipLimit: dto.wipLimit,
      },
    });
    this.events.emit('list:created', list, dto.boardId);
    return list;
  }

  async update(id: string, dto: UpdateListDto, _user?: { id: string; displayName: string }) {
    await this.findOne(id);
    const list = await this.prisma.list.update({ where: { id }, data: dto });
    this.events.emit('list:updated', list, list.boardId);
    return list;
  }

  async reorder(dto: ReorderListsDto) {
    const updates = dto.items.map((item) =>
      this.prisma.list.update({ where: { id: item.id }, data: { position: item.position } }),
    );
    const result = await this.prisma.$transaction(updates);
    // All items belong to the same board
    const boardId = dto.items.length > 0 ? (await this.prisma.list.findUnique({ where: { id: dto.items[0].id } }))?.boardId : undefined;
    this.events.emit('list:reordered', result, boardId);
    return result;
  }

  async remove(id: string, _user?: { id: string; displayName: string }) {
    const list = await this.findOne(id);
    await this.prisma.list.delete({ where: { id } });
    this.events.emit('list:deleted', { id }, list.boardId);
  }
}
