import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { BoardsService } from './boards.service';
import { CreateBoardDto, UpdateBoardDto } from './dto/board.dto';

@Controller('api/boards')
export class BoardsController {
  constructor(private readonly service: BoardsService) {}

  @Get()
  findAll() { return this.service.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Get(':id/full')
  findFull(@Param('id') id: string) { return this.service.findFull(id); }

  @Post()
  create(@Body() dto: CreateBoardDto) { return this.service.create(dto); }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBoardDto) { return this.service.update(id, dto); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
