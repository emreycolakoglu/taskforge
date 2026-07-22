import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { LabelsService } from '../labels/labels.service';
import { withTaskNumber } from '../tasks/tasks.service';
import { CreateBoardDto, UpdateBoardDto } from './dto/board.dto';

const DEFAULT_LABELS = [
  { name: 'Bug', color: '#EF4444' },
  { name: 'Feature', color: '#22C55E' },
  { name: 'Improvement', color: '#3B82F6' },
  { name: 'Documentation', color: '#A855F7' },
  { name: 'Urgent', color: '#F97316' },
];

@Injectable()
export class BoardsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private labelsService: LabelsService,
  ) {}

  async findAll() {
    return this.prisma.board.findMany({
      include: { _count: { select: { statuses: true, members: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const board = await this.prisma.board.findUnique({
      where: { id },
      include: {
        statuses: { orderBy: { position: 'asc' }, include: { _count: { select: { tasks: true } } } },
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
        statuses: {
          orderBy: { position: 'asc' },
          include: {
            tasks: {
              orderBy: { position: 'asc' },
              include: {
                assignee: { select: { id: true, email: true, displayName: true, role: true } },
                labels: { include: { label: true } },
                _count: { select: { comments: true, relationsTo: { where: { type: 'blocks' } } } },
                board: { select: { identifier: true } },
              },
            },
          },
        },
        labels: true,
        members: true,
      },
    });
    if (!board) throw new NotFoundException('Board not found');

    // Apply taskNumber transform to each task
    for (const status of board.statuses) {
      status.tasks = status.tasks.map(withTaskNumber);
    }

    return board;
  }

  async create(dto: CreateBoardDto, _user?: { id: string; displayName: string }) {
    const board = await this.prisma.board.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        identifier: dto.identifier.toUpperCase(),
        description: dto.description,
        icon: dto.icon,
        statuses: {
          create: [
            { name: 'Backlog', position: 0, color: '#94a3b8', progress: 0 },
            { name: 'To Do', position: 1, color: '#6366f1', progress: 25 },
            { name: 'In Progress', position: 2, color: '#f59e0b', progress: 50 },
            { name: 'Review', position: 3, color: '#8b5cf6', progress: 75 },
            { name: 'Done', position: 4, color: '#22c55e', isDone: true, progress: 100 },
          ],
        },
      },
      include: { statuses: true },
    });

    // Seed default labels for the new board
    for (const labelData of DEFAULT_LABELS) {
      await this.labelsService.create(board.id, labelData);
    }

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