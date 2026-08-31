import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { MembersService } from '../members/members.service';
import { CreateViewDto } from './dto/create-view.dto';
import { UpdateViewDto } from './dto/update-view.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Injectable()
export class ViewsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private members: MembersService,
  ) {}

  async findAll(boardId: string, userId: string) {
    return this.prisma.view.findMany({
      where: { boardId, OR: [{ isShared: true }, { userId }] },
      orderBy: { position: 'asc' },
    });
  }

  async findOne(id: string, user: AuthedUser) {
    const view = await this.prisma.view.findUnique({ where: { id } });
    if (!view) throw new NotFoundException('View not found');
    if (!view.isShared && view.userId !== user?.id) throw new NotFoundException('View not found');
    return view;
  }

  async create(dto: CreateViewDto, user: AuthedUser) {
    if (!user?.id) throw new ForbiddenException('Authentication required');
    if (dto.shared) await this.assertBoardMember(dto.boardId, user);
    await this.assertUniqueName(dto.boardId, user.id, dto.shared, dto.name);
    const filters = JSON.stringify(dto.filters ?? {});
    const view = await this.prisma.view.create({
      data: {
        boardId: dto.boardId,
        userId: user.id,
        isShared: dto.shared,
        name: dto.name,
        filters,
        groupBy: dto.groupBy ?? 'status',
        sortBy: dto.sortBy ?? 'position',
        layout: dto.layout ?? 'board',
        position: dto.position ?? 0,
      },
    });
    if (dto.shared) this.events.emit('view:created', view, dto.boardId);
    return view;
  }

  async update(id: string, dto: UpdateViewDto, user: AuthedUser) {
    const view = await this.prisma.view.findUnique({ where: { id } });
    if (!view) throw new NotFoundException('View not found');
    await this.assertCanMutate(view, user);
    if (dto.name && dto.name !== view.name) {
      await this.assertUniqueName(view.boardId, view.userId, view.isShared, dto.name);
    }
    const updated = await this.prisma.view.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.filters !== undefined && { filters: JSON.stringify(dto.filters) }),
        ...(dto.groupBy !== undefined && { groupBy: dto.groupBy }),
        ...(dto.sortBy !== undefined && { sortBy: dto.sortBy }),
        ...(dto.layout !== undefined && { layout: dto.layout }),
        ...(dto.position !== undefined && { position: dto.position }),
      },
    });
    if (view.isShared) this.events.emit('view:updated', updated, view.boardId);
    return updated;
  }

  async remove(id: string, user: AuthedUser) {
    const view = await this.prisma.view.findUnique({ where: { id } });
    if (!view) throw new NotFoundException('View not found');
    await this.assertCanMutate(view, user);
    await this.prisma.view.delete({ where: { id } });
    if (view.isShared) this.events.emit('view:deleted', { id }, view.boardId);
  }

  private async assertCanMutate(view: { boardId: string; userId: string }, user: AuthedUser) {
    // The creator can always modify their own view (personal or shared).
    if (view.userId === user?.id) return;
    // Non-creator board admins can manage views shared to the board.
    const isAdmin = user?.id ? await this.members.isBoardAdmin(view.boardId, user.id) : false;
    if (!isAdmin)
      throw new ForbiddenException('Only the creator or board admins can modify this view');
  }

  private async assertBoardMember(boardId: string, user: AuthedUser) {
    const member = await this.prisma.member.findUnique({
      where: { boardId_userId: { boardId, userId: user.id } },
    });
    if (member) return;
    // Global admins (user.role === 'admin') may create shared views on any board
    const isAdmin = await this.members.isBoardAdmin(boardId, user.id);
    if (!isAdmin) throw new ForbiddenException('Board membership required to create shared views');
  }

  private async assertUniqueName(boardId: string, userId: string, isShared: boolean, name: string) {
    const existing = await this.prisma.view.findFirst({
      where: { boardId, userId, isShared, name },
    });
    if (existing) throw new ConflictException(`A view named "${name}" already exists`);
  }
}
