import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateListDto, UpdateListDto, ReorderListsDto } from './dto/list.dto';

@Injectable()
export class ListsService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.list.create({
      data: {
        boardId: dto.boardId,
        name: dto.name,
        position: dto.position ?? (maxPos._max.position ?? -1) + 1,
        color: dto.color,
        wipLimit: dto.wipLimit,
      },
    });
  }

  async update(id: string, dto: UpdateListDto, _user?: { id: string; displayName: string }) {
    await this.findOne(id);
    return this.prisma.list.update({ where: { id }, data: dto });
  }

  async reorder(dto: ReorderListsDto) {
    const updates = dto.items.map((item) =>
      this.prisma.list.update({ where: { id: item.id }, data: { position: item.position } }),
    );
    return this.prisma.$transaction(updates);
  }

  async remove(id: string, _user?: { id: string; displayName: string }) {
    await this.findOne(id);
    return this.prisma.list.delete({ where: { id } });
  }
}
