import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto, MoveTaskDto, ReorderTasksDto } from './dto/task.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

/**
 * Publishing puts content on the public internet, so it requires a human who
 * logged in — not a bot token. Bot sessions live for 365 days and are handed to
 * AI agents; AuthGuard accepts them like any other session, so without this an
 * agent could publish a task over REST. MCP has no tasks_publish for the same
 * reason.
 */
function assertNotBot(req: Request): void {
  const session = (req as any).session as { bot?: boolean } | undefined;
  if (session?.bot) {
    throw new ForbiddenException('Bot sessions cannot change task visibility');
  }
}

@Controller('api/tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get('board/:boardId')
  findByBoard(
    @Param('boardId') boardId: string,
    @Query('include') include?: 'all' | 'top' | 'sub',
    @Query('parentId') parentId?: string,
  ) {
    return this.service.findByBoard(boardId, { include, parentId });
  }

  @Get('status/:statusId')
  findByStatus(
    @Param('statusId') statusId: string,
    @Query('include') include?: 'all' | 'top' | 'sub',
    @Query('parentId') parentId?: string,
  ) {
    return this.service.findByStatus(statusId, { include, parentId });
  }

  @Get('search')
  search(@Query('q') q: string) { return this.service.search(q); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  create(@Body() dto: CreateTaskDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.create(dto, user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.update(id, dto, user);
  }

  @Put(':id/move')
  move(@Param('id') id: string, @Body() dto: MoveTaskDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.move(id, dto, user);
  }

  @Put(':id/publish')
  publish(@Param('id') id: string, @Req() req: Request) {
    assertNotBot(req);
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.setPublic(id, true, user);
  }

  @Delete(':id/publish')
  unpublish(@Param('id') id: string, @Req() req: Request) {
    assertNotBot(req);
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.setPublic(id, false, user);
  }

  @Put('reorder')
  reorder(@Body() dto: ReorderTasksDto) { return this.service.reorder(dto); }

  @Post(':taskId/labels/:labelId')
  attachLabel(@Param('taskId') taskId: string, @Param('labelId') labelId: string) {
    return this.service.attachLabel(taskId, labelId);
  }

  @Delete(':taskId/labels/:labelId')
  detachLabel(@Param('taskId') taskId: string, @Param('labelId') labelId: string) {
    return this.service.detachLabel(taskId, labelId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.remove(id, user);
  }
}