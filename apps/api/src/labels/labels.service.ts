import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateLabelDto, UpdateLabelDto } from './dto/label.dto';

@Injectable()
export class LabelsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async findByBoard(boardId: string) {
    return this.prisma.label.findMany({ where: { boardId }, orderBy: { name: 'asc' } });
  }

  async create(dto: CreateLabelDto, _user?: { id: string; displayName: string }) {
    const label = await this.prisma.label.create({
      data: { boardId: dto.boardId, name: dto.name, color: dto.color ?? '#6366f1' },
    });
    this.events.emit('label:created', label, dto.boardId);
    return label;
  }

  async update(id: string, dto: UpdateLabelDto, _user?: { id: string; displayName: string }) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Label not found');
    const updated = await this.prisma.label.update({ where: { id }, data: dto });
    this.events.emit('label:updated', updated, label.boardId);
    return updated;
  }

  async remove(id: string, _user?: { id: string; displayName: string }) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Label not found');
    await this.prisma.taskLabel.deleteMany({ where: { labelId: id } });
    await this.prisma.label.delete({ where: { id } });
    this.events.emit('label:deleted', { id }, label.boardId);
  }
}
