import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/comment.dto';

@Controller('api/comments')
export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @Get('task/:taskId')
  findByTask(@Param('taskId') taskId: string) { return this.service.findByTask(taskId); }

  @Post()
  create(@Body() dto: CreateCommentDto) { return this.service.create(dto); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
