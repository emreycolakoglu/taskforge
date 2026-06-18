import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Injectable()
export class LabelsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async findAll(boardId: string) {
    return this.prisma.label.findMany({ where: { boardId }, orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Label not found');
    return label;
  }

  async create(boardId: string, dto: CreateLabelDto) {
    const label = await this.prisma.label.create({
      data: { boardId, name: dto.name, color: dto.color },
    });
    this.events.emit('label:created', label, boardId);
    return label;
  }

  async update(id: string, dto: UpdateLabelDto) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Label not found');
    const updated = await this.prisma.label.update({ where: { id }, data: dto });
    this.events.emit('label:updated', updated, label.boardId);
    return updated;
  }

  async remove(id: string) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Label not found');
    await this.prisma.taskLabel.deleteMany({ where: { labelId: id } });
    await this.prisma.label.delete({ where: { id } });
    this.events.emit('label:deleted', { id }, label.boardId);
  }
}