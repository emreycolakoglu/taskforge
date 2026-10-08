/**
 * ProjectsService — workspace-level project containers (Projects v2).
 * Projects group tasks from ANY board into named, orderable containers (a
 * lightweight roadmap). Writes are open to every authenticated human
 * (bot sessions are rejected, mirroring the publish bot-gate); reads are
 * unscoped, matching the rest of the app.
 */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { withTaskNumber } from '../tasks/tasks.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

interface AuthedUser {
  id: string;
  displayName: string;
  /**
   * Session flag folded in by ProjectsController (REST) — true when the
   * request rides a 365-day bot token. Bot sessions may read projects but
   * must not manage them. MCP passes no flag.
   */
  bot?: boolean;
}

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async findAll() {
    // Workspace-wide: every project, position order. No board scoping.
    return this.prisma.project.findMany({
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
        // withTaskNumber derives `taskNumber: '<identifier>-<number>'` from
        // the board relation — include the identifier or every row maps to a
        // null taskNumber and the detail page renders without it.
        board: { select: { identifier: true } },
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        project: { select: { id: true, name: true, icon: true } },
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
      // Map through the tasks.service house mapper so project task rows match
      // every other task payload (taskNumber, blockedByCount, blockingCount).
      // MCP projects_get delegates here and inherits this automatically.
      tasks: tasks.map(withTaskNumber),
      progress: { total: tasks.length, completed, byStatus },
    };
  }

  async create(dto: CreateProjectDto, user: AuthedUser) {
    if (!user?.id) throw new ForbiddenException('Authentication required');
    if (user.bot) throw new ForbiddenException('Bot sessions cannot manage projects');
    const max = await this.prisma.project.aggregate({
      _max: { position: true },
    });
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        icon: dto.icon ?? '📦',
        leadId: dto.leadId,
        status: dto.status ?? 'planned',
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        // Append at the end of the workspace; the FIRST project must land on
        // position 0 — statuses.service house pattern `(max._max.position ??
        // -1) + 1` (a `?? 0` base would put the first project at 1 and an
        // aggregate null would make it 1, not 0).
        position: (max._max.position ?? -1) + 1,
      },
    });
    // No third arg: projects are workspace-level, so this broadcasts to every
    // connected socket (EventsService treats undefined boardId as broadcast).
    this.events.emit('project:created', project);
    return project;
  }

  async update(id: string, dto: UpdateProjectDto, user: AuthedUser) {
    if (!user?.id) throw new ForbiddenException('Authentication required');
    if (user.bot) throw new ForbiddenException('Bot sessions cannot manage projects');
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
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
    this.events.emit('project:updated', updated);
    return updated;
  }

  async remove(id: string, user: AuthedUser) {
    if (!user?.id) throw new ForbiddenException('Authentication required');
    if (user.bot) throw new ForbiddenException('Bot sessions cannot manage projects');
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    await this.prisma.project.delete({ where: { id } });
    // Linked tasks survive with projectId = null (FK SetNull).
    this.events.emit('project:deleted', { id });
  }
}
