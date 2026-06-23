import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateRelationDto } from './dto/relation.dto';

export interface RelationEntry {
  relationId: string;
  type: 'blocks' | 'related_to';
  task: { id: string; taskNumber: string; title: string; status: string };
}

export interface TaskRelationsResponse {
  taskId: string;
  blocking: RelationEntry[];
  blockedBy: RelationEntry[];
  relatedTo: RelationEntry[];
}

interface RelationEventPayload {
  relationId: string;
  type: 'blocks' | 'related_to';
  fromTaskId: string;
  toTaskId: string;
  boardId: string;
}

/**
 * Task relations: "blocks" (directed) and "related_to" (undirected, canonicalized).
 *
 * Storage convention:
 *  - blocks:   one row { fromTaskId: blocker, toTaskId: blocked }
 *  - related_to: one row with fromTaskId < toTaskId lexicographically
 *
 * Cycle prevention applies to "blocks" only (DFS over outgoing blocks edges).
 */
@Injectable()
export class RelationsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async list(taskId: string): Promise<TaskRelationsResponse> {
    const rows = await this.prisma.taskRelation.findMany({
      where: { OR: [{ fromTaskId: taskId }, { toTaskId: taskId }] },
      include: {
        fromTask: { select: { id: true, number: true, title: true, status: true, board: { select: { identifier: true } } } },
        toTask: { select: { id: true, number: true, title: true, status: true, board: { select: { identifier: true } } } },
      },
    });

    const entry = (relId: string, type: 'blocks' | 'related_to', t: { id: string; number: number; title: string; status: string; board: { identifier: string } | null }): RelationEntry => ({
      relationId: relId,
      type,
      task: {
        id: t.id,
        taskNumber: t.board?.identifier ? `${t.board.identifier}-${t.number}` : String(t.number),
        title: t.title,
        status: t.status,
      },
    });

    const blocking: RelationEntry[] = [];
    const blockedBy: RelationEntry[] = [];
    const relatedTo: RelationEntry[] = [];

    for (const r of rows) {
      if (r.type === 'blocks') {
        if (r.fromTaskId === taskId) {
          blocking.push(entry(r.id, 'blocks', r.toTask));
        } else {
          blockedBy.push(entry(r.id, 'blocks', r.fromTask));
        }
      } else if (r.type === 'related_to') {
        const other = r.fromTaskId === taskId ? r.toTask : r.fromTask;
        relatedTo.push(entry(r.id, 'related_to', other));
      }
    }

    return { taskId, blocking, blockedBy, relatedTo };
  }

  async create(taskId: string, dto: CreateRelationDto): Promise<RelationEntry> {
    // 1. Self-reference
    if (dto.otherTaskId === taskId) {
      throw new BadRequestException('A task cannot be related to itself');
    }

    // 2. Other task exists
    const other = await this.prisma.task.findUnique({
      where: { id: dto.otherTaskId },
      select: { id: true, number: true, title: true, status: true, boardId: true, board: { select: { identifier: true } } },
    });
    if (!other) throw new NotFoundException('Related task not found');

    // 3. Same board
    const urlTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, number: true, title: true, status: true, boardId: true, board: { select: { identifier: true } } },
    });
    if (!urlTask) throw new NotFoundException('Task not found');
    if (urlTask.boardId !== other.boardId) {
      throw new BadRequestException('Related tasks must be in the same board');
    }

    // 4. Type-specific normalization
    let fromTaskId: string;
    let toTaskId: string;
    if (dto.type === 'blocks') {
      const direction = dto.direction ?? 'source';
      // 'source' = URL task blocks other → {from: urlTask, to: other}
      // 'target' = URL task blocked by other → {from: other, to: urlTask}
      if (direction === 'source') {
        fromTaskId = taskId;
        toTaskId = dto.otherTaskId;
      } else {
        fromTaskId = dto.otherTaskId;
        toTaskId = taskId;
      }
    } else {
      // related_to: canonicalize so fromTaskId < toTaskId
      if (taskId < dto.otherTaskId) {
        fromTaskId = taskId;
        toTaskId = dto.otherTaskId;
      } else {
        fromTaskId = dto.otherTaskId;
        toTaskId = taskId;
      }
    }

    // 6. Cycle prevention (blocks only)
    if (dto.type === 'blocks') {
      await this.assertNoBlocksCycle(fromTaskId, toTaskId);
    }

    // 5. Create (duplicate → 409 via @@unique)
    let row;
    try {
      row = await this.prisma.taskRelation.create({
        data: { type: dto.type, fromTaskId, toTaskId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Relation already exists');
      }
      throw err;
    }

    const boardId = urlTask.boardId;
    const payload: RelationEventPayload = {
      relationId: row.id,
      type: dto.type,
      fromTaskId,
      toTaskId,
      boardId,
    };
    this.events.emit('relation:created', payload, boardId);

    // Return a RelationEntry for the "other" task (from the URL task's perspective)
    const otherTaskNumber = other.board?.identifier ? `${other.board.identifier}-${other.number}` : String(other.number);
    return {
      relationId: row.id,
      type: dto.type,
      task: { id: other.id, taskNumber: otherTaskNumber, title: other.title, status: other.status },
    };
  }

  async delete(relationId: string): Promise<{ deleted: boolean }> {
    const row = await this.prisma.taskRelation.findUnique({
      where: { id: relationId },
      include: { fromTask: { select: { boardId: true } } },
    });
    if (!row) throw new NotFoundException('Relation not found');

    await this.prisma.taskRelation.delete({ where: { id: relationId } });

    const boardId = row.fromTask.boardId;
    this.events.emit('relation:deleted', {
      relationId: row.id,
      type: row.type as 'blocks' | 'related_to',
      fromTaskId: row.fromTaskId,
      toTaskId: row.toTaskId,
      boardId,
    } satisfies RelationEventPayload, boardId);

    return { deleted: true };
  }

  /**
   * Hard-delete all relation rows touching taskId. Emits relation:deleted per row.
   * Used by TasksService.remove() and McpService tasks_delete on archive.
   */
  async cleanupForTask(taskId: string): Promise<void> {
    const rows = await this.prisma.taskRelation.findMany({
      where: { OR: [{ fromTaskId: taskId }, { toTaskId: taskId }] },
      include: { fromTask: { select: { boardId: true } } },
    });
    if (rows.length === 0) return;

    await this.prisma.taskRelation.deleteMany({
      where: { OR: [{ fromTaskId: taskId }, { toTaskId: taskId }] },
    });

    for (const r of rows) {
      this.events.emit('relation:deleted', {
        relationId: r.id,
        type: r.type as 'blocks' | 'related_to',
        fromTaskId: r.fromTaskId,
        toTaskId: r.toTaskId,
        boardId: r.fromTask.boardId,
      } satisfies RelationEventPayload, r.fromTask.boardId);
    }
  }

  /**
   * DFS from toTaskId over outgoing blocks edges. If we reach fromTaskId, the
   * proposed A→B edge would close a cycle (B can already reach A).
   */
  private async assertNoBlocksCycle(fromTaskId: string, toTaskId: string): Promise<void> {
    const visited = new Set<string>();
    const stack = [toTaskId];
    while (stack.length) {
      const current = stack.pop()!;
      if (current === fromTaskId) {
        throw new BadRequestException('This blocks relationship would create a cycle');
      }
      if (visited.has(current)) continue;
      visited.add(current);
      const outgoing = await this.prisma.taskRelation.findMany({
        where: { type: 'blocks', fromTaskId: current },
        select: { toTaskId: true },
      });
      for (const e of outgoing) stack.push(e.toTaskId);
    }
  }
}