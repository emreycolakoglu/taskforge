import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { RelationsService } from './relations.service';
import { CreateRelationDto } from './dto/relation.dto';

/**
 * Relations are scoped under a task for ergonomics, but deletion only needs the
 * relation id (the taskId in the path is informational). The service derives
 * the board for events from the relation row itself.
 */
@Controller('api/tasks/:taskId/relations')
export class RelationsController {
  constructor(private readonly service: RelationsService) {}

  @Get()
  list(@Param('taskId') taskId: string) {
    return this.service.list(taskId);
  }

  @Post()
  create(@Param('taskId') taskId: string, @Body() dto: CreateRelationDto) {
    return this.service.create(taskId, dto);
  }

  @Delete(':relationId')
  remove(@Param('taskId') _taskId: string, @Param('relationId') relationId: string) {
    return this.service.delete(relationId);
  }
}