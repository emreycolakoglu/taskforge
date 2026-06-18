import { Controller, Get, Post, Put, Delete, Param, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { LabelsService } from './labels.service';
import { CreateLabelDto, UpdateLabelDto } from './dto/label.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api/labels')
export class LabelsController {
  constructor(private readonly service: LabelsService) {}

  @Get('board/:boardId')
  findByBoard(@Param('boardId') boardId: string) { return this.service.findByBoard(boardId); }

  @Post()
  create(@Body() dto: CreateLabelDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.create(dto, user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLabelDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.remove(id, user);
  }
}
