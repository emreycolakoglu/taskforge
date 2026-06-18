import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLabelDto, UpdateLabelDto } from './dto/label.dto';

@Injectable()
export class LabelsService {
  constructor(private prisma: PrismaService) {}

  async findByBoard(boardId: string) {
    return this.prisma.label.findMany({ where: { boardId }, orderBy: { name: 'asc' } });
  }

  async create(dto: CreateLabelDto, _user?: { id: string; displayName: string }) {
    return this.prisma.label.create({
      data: { boardId: dto.boardId, name: dto.name, color: dto.color ?? '#6366f1' },
    });
  }

  async update(id: string, dto: UpdateLabelDto, _user?: { id: string; displayName: string }) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) throw new NotFoundException('Label not found');
    return this.prisma.label.update({ where: { id }, data: dto });
  }

  async remove(id: string, _user?: { id: string; displayName: string }) {
    await this.prisma.taskLabel.deleteMany({ where: { labelId: id } });
    return this.prisma.label.delete({ where: { id } });
  }
}
