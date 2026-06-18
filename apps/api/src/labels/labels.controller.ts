import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { LabelsService } from './labels.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Controller('api')
export class LabelsController {
  constructor(private readonly service: LabelsService) {}

  @Get('boards/:boardId/labels')
  findAll(@Param('boardId') boardId: string) {
    return this.service.findAll(boardId);
  }

  @Post('boards/:boardId/labels')
  create(@Param('boardId') boardId: string, @Body() dto: CreateLabelDto) {
    return this.service.create(boardId, dto);
  }

  @Patch('labels/:id')
  update(@Param('id') id: string, @Body() dto: UpdateLabelDto) {
    return this.service.update(id, dto);
  }

  @Delete('labels/:id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}