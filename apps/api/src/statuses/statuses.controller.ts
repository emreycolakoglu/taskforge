import { Controller, Get, Post, Put, Delete, Param, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { StatusesService } from './statuses.service';
import { CreateStatusDto, UpdateStatusDto, ReorderStatusesDto } from './dto/status.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api/statuses')
export class StatusesController {
  constructor(private readonly service: StatusesService) {}

  @Get('board/:boardId')
  findByBoard(@Param('boardId') boardId: string) { return this.service.findByBoard(boardId); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  create(@Body() dto: CreateStatusDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.create(dto, user);
  }

  @Put('reorder')
  reorder(@Body() dto: ReorderStatusesDto) { return this.service.reorder(dto); }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStatusDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.remove(id, user);
  }

  @Post(':id/toggle-done')
  toggleDone(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.toggleDone(id, user);
  }

  @Post('board/:boardId/unset-done')
  unsetDone(@Param('boardId') boardId: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.unsetDone(boardId, user);
  }
}
