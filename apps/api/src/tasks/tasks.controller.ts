import { Controller, Get, Post, Put, Delete, Param, Body, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto, MoveTaskDto, ReorderTasksDto } from './dto/task.dto';

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
  create(@Body() dto: CreateTaskDto) { return this.service.create(dto); }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) { return this.service.update(id, dto); }

  @Put(':id/move')
  move(@Param('id') id: string, @Body() dto: MoveTaskDto) { return this.service.move(id, dto); }

  @Put('reorder')
  reorder(@Body() dto: ReorderTasksDto) { return this.service.reorder(dto); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
