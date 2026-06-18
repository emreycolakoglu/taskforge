import { Controller, Get, Post, Delete, Param, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/comment.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api/comments')
export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @Get('task/:taskId')
  findByTask(@Param('taskId') taskId: string) { return this.service.findByTask(taskId); }

  @Post()
  create(@Body() dto: CreateCommentDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.create(dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
