/**
 * ViewsController — REST endpoints for saved board views:
 * list per board (personal + shared), read, create, update, delete (creator-or-admin writes).
 */
import { Body, Controller, Delete, Get, Patch, Post, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { ViewsService } from './views.service';
import { CreateViewDto } from './dto/create-view.dto';
import { UpdateViewDto } from './dto/update-view.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api')
export class ViewsController {
  constructor(private readonly service: ViewsService) {}

  @Get('boards/:boardId/views')
  findAll(@Param('boardId') boardId: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.findAll(boardId, user!.id);
  }

  @Get('views/:id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.findOne(id, user!);
  }

  @Post('views')
  create(@Body() dto: CreateViewDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.create(dto, user!);
  }

  @Patch('views/:id')
  update(@Param('id') id: string, @Body() dto: UpdateViewDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.update(id, dto, user!);
  }

  @Delete('views/:id')
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.remove(id, user!);
  }
}
