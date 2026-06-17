import { Controller, Get, Param } from '@nestjs/common';
import { ActivityService } from './activity.service';

@Controller('api/activity')
export class ActivityController {
  constructor(private readonly service: ActivityService) {}

  @Get('task/:taskId')
  findByTask(@Param('taskId') taskId: string) { return this.service.findByTask(taskId); }

  @Get('board/:boardId')
  findByBoard(@Param('boardId') boardId: string) { return this.service.findByBoard(boardId); }
}
