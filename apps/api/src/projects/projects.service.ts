/**
 * ProjectsService — groups the tasks of a board into named, orderable
 * containers (a lightweight roadmap). Writes are gated to board admins;
 * reads are unscoped, matching the rest of the app.
 */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { MembersService } from '../members/members.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private members: MembersService,
  ) {}

  async findAll(boardId: string) {
    return this.prisma.project.findMany({
      where: { boardId },
      orderBy: { position: 'asc' },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    const tasks = await this.prisma.task.findMany({
      where: { projectId: id },
      include: {
        status: true,
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
      },
      orderBy: [{ status: { position: 'asc' } }, { position: 'asc' }],
    });
    const byStatus: Record<string, number> = {};
    let completed = 0;
    for (const task of tasks) {
      byStatus[task.status.type] = (byStatus[task.status.type] ?? 0) + 1;
      if (task.status.type === 'done') completed += 1;
    }
    return {
      ...project,
      tasks,
      progress: { total: tasks.length, completed, byStatus },
    };
  }

  async create(dto: CreateProjectDto, user: AuthedUser) {
    if (!user?.id) throw new ForbiddenException('Authentication required');
    await this.assertCanMutateBoard(dto.boardId, user);
    const max = await this.prisma.project.aggregate({
      where: { boardId: dto.boardId },
      _max: { position: true },
    });
    const project = await this.prisma.project.create({
      data: {
        boardId: dto.boardId,
        name: dto.name,
        description: dto.description,
        icon: dto.icon ?? '📦',
        leadId: dto.leadId,
        status: dto.status ?? 'planned',
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        position: (max._max.position ?? 0) + 1,
      },
    });
    this.events.emit('project:created', project, project.boardId);
    return project;
  }

  async update(id: string, dto: UpdateProjectDto, user: AuthedUser) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    await this.assertCanMutateBoard(project.boardId, user);
    const data: Prisma.ProjectUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.icon !== undefined && { icon: dto.icon }),
      ...(dto.leadId !== undefined && { leadId: dto.leadId }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
      ...(dto.targetDate !== undefined && { targetDate: new Date(dto.targetDate) }),
      ...(dto.position !== undefined && { position: dto.position }),
    };
    if (dto.status !== undefined && dto.status !== project.status) {
      // completedAt tracks the completed lifecycle: stamped on entering
      // "completed", cleared on leaving, untouched when not moving.
      data.completedAt = dto.status === 'completed' ? new Date() : null;
    }
    const updated = await this.prisma.project.update({ where: { id }, data });
    this.events.emit('project:updated', updated, project.boardId);
    return updated;
  }

  async remove(id: string, user: AuthedUser) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    await this.assertCanMutateBoard(project.boardId, user);
    await this.prisma.project.delete({ where: { id } });
    // Linked tasks survive with projectId = null (FK SetNull).
    this.events.emit('project:deleted', { id }, project.boardId);
  }

  private async assertCanMutateBoard(boardId: string, user: AuthedUser) {
    if (user?.id && (await this.members.isBoardAdmin(boardId, user.id))) return;
    // Legacy board fallback: boards with zero Member rows (pre-members era)
    // allow all writes, mirroring BoardsService.
    if (user?.id && (await this.isLegacyBoard(boardId))) return;
    throw new ForbiddenException('Only board admins can manage projects');
  }

  private async isLegacyBoard(boardId: string): Promise<boolean> {
    const count = await this.prisma.member.count({ where: { boardId } });
    return count === 0;
  }
}
