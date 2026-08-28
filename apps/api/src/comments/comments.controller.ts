import { Controller, Get, Post, Patch, Delete, Param, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { CommentsService } from './comments.service';
import { CreateCommentDto, UpdateCommentDto, ReactDto } from './dto/comment.dto';

interface AuthedUser {
  id: string;
  displayName: string;
  role: string;
}

@Controller('api/comments')
export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @Get('task/:taskId')
  findByTask(@Param('taskId') taskId: string) {
    return this.service.findByTask(taskId);
  }

  @Post()
  create(@Body() dto: CreateCommentDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCommentDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.update(id, dto.body, user);
  }

  @Post(':id/reactions')
  react(@Param('id') id: string, @Body() dto: ReactDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser;
    return this.service.react(id, dto.emoji, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.remove(id, user);
  }
}
