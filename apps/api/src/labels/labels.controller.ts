import { Controller, Get, Post, Patch, Delete, Param, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { LabelsService } from './labels.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api')
export class LabelsController {
  constructor(private readonly service: LabelsService) {}

  @Get('boards/:boardId/labels')
  findAll(@Param('boardId') boardId: string) {
    return this.service.findAll(boardId);
  }

  @Post('boards/:boardId/labels')
  create(@Param('boardId') boardId: string, @Body() dto: CreateLabelDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.create(boardId, dto, user);
  }

  @Patch('labels/:id')
  update(@Param('id') id: string, @Body() dto: UpdateLabelDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.update(id, dto, user);
  }

  @Delete('labels/:id')
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.remove(id, user);
  }
}
