import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { ListsService } from './lists.service';
import { CreateListDto, UpdateListDto, ReorderListsDto } from './dto/list.dto';

@Controller('api/lists')
export class ListsController {
  constructor(private readonly service: ListsService) {}

  @Get('board/:boardId')
  findByBoard(@Param('boardId') boardId: string) { return this.service.findByBoard(boardId); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  create(@Body() dto: CreateListDto) { return this.service.create(dto); }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateListDto) { return this.service.update(id, dto); }

  @Put('reorder')
  reorder(@Body() dto: ReorderListsDto) { return this.service.reorder(dto); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
