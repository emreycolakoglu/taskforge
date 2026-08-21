import { Controller, Get, Post, Put, Delete, Param, Body, Req, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

/**
 * Publishing puts content on the public internet, so it requires a human who
 * logged in — not a bot token. Mirrors TasksController.assertNotBot.
 */
function assertNotBot(req: Request): void {
  const session = (req as any).session as { bot?: boolean } | undefined;
  if (session?.bot) {
    throw new ForbiddenException('Bot sessions cannot change document visibility');
  }
}

@Controller('api')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get('boards/:boardId/documents')
  findByBoard(@Param('boardId') boardId: string) { return this.service.findByBoard(boardId); }

  @Get('tasks/:taskId/documents')
  findByTask(@Param('taskId') taskId: string) { return this.service.findByTask(taskId); }

  @Post('tasks/:taskId/documents')
  create(@Param('taskId') taskId: string, @Body() dto: CreateDocumentDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.create(taskId, dto, user);
  }

  @Get('documents/:id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Put('documents/:id')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.update(id, dto, user);
  }

  @Delete('documents/:id')
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.remove(id, user);
  }

  @Put('documents/:id/publish')
  publish(@Param('id') id: string, @Req() req: Request) {
    assertNotBot(req);
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.setPublic(id, true, user);
  }

  @Delete('documents/:id/publish')
  unpublish(@Param('id') id: string, @Req() req: Request) {
    assertNotBot(req);
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.setPublic(id, false, user);
  }
}
