import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { MembersService } from '../members/members.service';
import { CreateStatusDto, UpdateStatusDto, ReorderStatusesDto } from './dto/status.dto';
import { STATUS_TYPES, defaultProgressForType, isProgressEditable } from './status-types';

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
        progress: defaultProgressForType(dto.type),
      },
    });
    this.events.emit('status:created', status, dto.boardId);
    return status;
  }

  async update(id: string, dto: UpdateStatusDto, user?: AuthedUser) {
    const existing = await this.findOne(id);
    await this.assertBoardAdmin(existing.boardId, user, 'update statuses');

    // Editability is evaluated against the TARGET type when changing type, not the
    // existing one — otherwise a done→in_progress transition with progress would
    // reject on the source type before the transition can apply.
    const targetType = dto.type !== undefined ? dto.type : existing.type;

    if (dto.progress !== undefined && !isProgressEditable(targetType)) {
      throw new BadRequestException(`Progress is not editable for status type "${targetType}"`);
    }

    const data: Record<string, any> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.color !== undefined) data.color = dto.color;

    if (dto.type !== undefined) {
      data.type = dto.type;
      if (!isProgressEditable(dto.type)) {
        data.progress = defaultProgressForType(dto.type);
      } else if (dto.progress !== undefined) {
        data.progress = dto.progress;
      } else {
        // Type change to an editable type without an explicit progress: use the
        // type default rather than carrying a stale value across the transition.
        data.progress = defaultProgressForType(dto.type);
      }
    } else if (dto.progress !== undefined && isProgressEditable(existing.type)) {
      data.progress = dto.progress;
    }

    const status = await this.prisma.status.update({ where: { id }, data });
    this.events.emit('status:updated', status, status.boardId);
    return status;
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
    this.events.emit('status:reordered', result, boardId);
    return result;
  }

  async remove(id: string, user?: AuthedUser) {
    const status = await this.findOne(id);
    await this.assertBoardAdmin(status.boardId, user, 'delete statuses');
    await this.prisma.status.delete({ where: { id } });
    this.events.emit('status:deleted', { id }, status.boardId);
  }

  private async assertBoardAdmin(boardId: string, user: AuthedUser | undefined, action: string) {
    if (!user?.id) throw new ForbiddenException('Admin access required');
    const isAdmin = await this.members.isBoardAdmin(boardId, user.id);
    if (!isAdmin) throw new ForbiddenException(`Only board admins can ${action}`);
  }
}
