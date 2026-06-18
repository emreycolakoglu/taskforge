import { Controller, Get, Post, Put, Delete, Param, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { ListsService } from './lists.service';
import { CreateListDto, UpdateListDto, ReorderListsDto } from './dto/list.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api/lists')
export class ListsController {
  constructor(private readonly service: ListsService) {}

  @Get('board/:boardId')
  findByBoard(@Param('boardId') boardId: string) { return this.service.findByBoard(boardId); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  create(@Body() dto: CreateListDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.create(dto, user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateListDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.update(id, dto, user);
  }

  @Put('reorder')
  reorder(@Body() dto: ReorderListsDto) { return this.service.reorder(dto); }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.remove(id, user);
  }
}
