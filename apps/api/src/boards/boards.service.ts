import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { LabelsService } from '../labels/labels.service';
import { withTaskNumber } from '../tasks/tasks.service';
import { DEFAULT_STATUSES } from '../statuses/status-defaults';
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
      include: { _count: { select: { statuses: true, members: true } }, members: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const board = await this.prisma.board.findUnique({
      where: { id },
      include: {
        statuses: {
          orderBy: { position: 'asc' },
          include: { _count: { select: { tasks: true } } },
        },
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
                _count: {
                  select: {
                    comments: true,
                    relationsTo: { where: { type: 'blocks' } },
                    relationsFrom: { where: { type: 'blocks' } },
                  },
                },
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
          create: DEFAULT_STATUSES,
        },
      },
      include: { statuses: true },
    });

    // Seed default labels for the new board. Part of board creation itself, so
    // it is not subject to the label admin gate: when a creator is present they
    // have just been made admin (and could create these anyway), and userless
    // creation (system/seeding) has no actor to authorize.
    if (_user?.id) {
      await this.prisma.member.create({
        data: { boardId: board.id, userId: _user.id, role: 'admin' },
      });
    }
    for (const labelData of DEFAULT_LABELS) {
      await this.prisma.label.create({
        data: { boardId: board.id, ...labelData },
      });
    }

    this.events.emit('board:created', board);
    return board;
  }

  async update(id: string, dto: UpdateBoardDto, _user?: { id: string; displayName: string }) {
    await this.assertBoardAdmin(id, _user);
    await this.findOne(id);
    const data: Record<string, any> = { ...dto };
    if (dto.identifier) data.identifier = dto.identifier.toUpperCase();
    const board = await this.prisma.board.update({ where: { id }, data });
    this.events.emit('board:updated', board, id);
    return board;
  }

  async remove(id: string, _user?: { id: string; displayName: string }) {
    await this.assertBoardAdmin(id, _user);
    await this.findOne(id);
    await this.prisma.board.delete({ where: { id } });
    this.events.emit('board:deleted', { id }, id);
  }

  /**
   * Board-level admin gate for destructive/config operations (update, remove).
   * Global admins (user.role === 'admin') always pass, matching
   * MembersService.isBoardAdmin. Otherwise the user must be a member with role
   * 'admin' on the board. If the board has no admin member rows at all (e.g.
   * legacy boards created before members existed), we allow the call as a
   * pragmatic fallback rather than locking the board.
   */
  private async assertBoardAdmin(boardId: string, user?: { id: string; displayName: string }) {
    if (!user?.id) {
      throw new ForbiddenException('Admin access required');
    }
    const userRow = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (userRow?.role === 'admin') return;
    const admins = await this.prisma.member.findMany({
      where: { boardId, role: 'admin' },
    });
    if (admins.length === 0) return; // legacy board with no admin rows — allow
    const isAdmin = admins.some((m) => m.userId === user.id);
    if (!isAdmin) {
      throw new ForbiddenException('Only board admins can perform this action');
    }
  }
}
