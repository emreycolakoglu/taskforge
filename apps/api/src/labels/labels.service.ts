import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { MembersService } from '../members/members.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Injectable()
export class LabelsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private members: MembersService,
  ) {}

  async findAll(boardId: string) {
    return this.prisma.label.findMany({ where: { boardId }, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Label not found');
    return label;
  }

  async create(boardId: string, dto: CreateLabelDto, user?: AuthedUser) {
    await this.assertBoardAdmin(boardId, user, 'create labels');
    const label = await this.prisma.label.create({
      data: { boardId, name: dto.name, color: dto.color },
    });
    this.events.emit('label:created', label, boardId);
    return label;
  }

  async update(id: string, dto: UpdateLabelDto, user?: AuthedUser) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Label not found');
    await this.assertBoardAdmin(label.boardId, user, 'update labels');
    const updated = await this.prisma.label.update({ where: { id }, data: dto });
    this.events.emit('label:updated', updated, label.boardId);
    return updated;
  }

  async remove(id: string, user?: AuthedUser) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Label not found');
    await this.assertBoardAdmin(label.boardId, user, 'delete labels');
    await this.prisma.taskLabel.deleteMany({ where: { labelId: id } });
    await this.prisma.label.delete({ where: { id } });
    this.events.emit('label:deleted', { id }, label.boardId);
  }

  private async assertBoardAdmin(boardId: string, user: AuthedUser | undefined, action: string) {
    if (!user?.id) throw new ForbiddenException('Admin access required');
    const isAdmin = await this.members.isBoardAdmin(boardId, user.id);
    if (!isAdmin) throw new ForbiddenException(`Only board admins can ${action}`);
  }
}
