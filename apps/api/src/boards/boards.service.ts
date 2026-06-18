import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBoardDto, UpdateBoardDto } from './dto/board.dto';

@Injectable()
export class BoardsService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.board.create({
      data: {
        name: dto.name,
        slug: dto.slug,
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
  }

  async update(id: string, dto: UpdateBoardDto, _user?: { id: string; displayName: string }) {
    await this.findOne(id);
    return this.prisma.board.update({ where: { id }, data: dto });
  }

  async remove(id: string, _user?: { id: string; displayName: string }) {
    await this.findOne(id);
    return this.prisma.board.delete({ where: { id } });
  }
}
