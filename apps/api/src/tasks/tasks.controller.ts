import { Controller, Get, Post, Put, Delete, Param, Body, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto, MoveTaskDto, ReorderTasksDto } from './dto/task.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api/tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get('board/:boardId')
  findByBoard(@Param('boardId') boardId: string) { return this.service.findByBoard(boardId); }

  @Get('list/:listId')
  findByList(@Param('listId') listId: string) { return this.service.findByList(listId); }

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