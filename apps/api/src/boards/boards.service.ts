import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateBoardDto, UpdateBoardDto } from './dto/board.dto';

@Injectable()
export class BoardsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async findAll() {
    return this.prisma.board.findMany({
      include: { _count: { select: { lists: true, members: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const board = await this.prisma.board.findUnique({
      where: { id },
      include: {
        lists: { orderBy: { position: 'asc' }, include: { _count: { select: { tasks: true } } } },
        labels: true,
        members: true,
      },
    });
    if (!board) throw new NotFoundException('Board not found');
    return board;
  }

  async findFull(id: string) {
    const board = await this.prisma.board.findUnique({
      where: { id },
      include: {
        lists: {
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              where: { status: 'active' },
              orderBy: { position: 'asc' },
              include: { labels: { include: { label: true } }, comments: true },
            },
          },
        },
        labels: true,
        members: true,
      },
    });
    if (!board) throw new NotFoundException('Board not found');
    return board;
  }

  async create(dto: CreateBoardDto, _user?: { id: string; displayName: string }) {
    const board = await this.prisma.board.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        identifier: dto.identifier.toUpperCase(),
        description: dto.description,
        lists: {
          create: [
            { name: 'Backlog', position: 0, color: '#94a3b8' },
            { name: 'To Do', position: 1, color: '#6366f1' },
            { name: 'In Progress', position: 2, color: '#f59e0b' },
            { name: 'Review', position: 3, color: '#8b5cf6' },
            { name: 'Done', position: 4, color: '#22c55e' },
          ],
        },
      },
      include: { lists: true },
    });
    this.events.emit('board:created', board);
    return board;
  }

  async update(id: string, dto: UpdateBoardDto, _user?: { id: string; displayName: string }) {
    await this.findOne(id);
    const data: Record<string, any> = { ...dto };
    if (dto.identifier) data.identifier = dto.identifier.toUpperCase();
    const board = await this.prisma.board.update({ where: { id }, data });
    this.events.emit('board:updated', board, id);
    return board;
  }

  async remove(id: string, _user?: { id: string; displayName: string }) {
    await this.findOne(id);
    await this.prisma.board.delete({ where: { id } });
    this.events.emit('board:deleted', { id }, id);
  }
}
