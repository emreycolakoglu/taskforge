/**
 * ProjectsController — REST endpoints for board projects:
 * list per board, read with task rollup, create, update, delete (admin-only writes).
 */
import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get('boards/:boardId/projects')
  findAll(@Param('boardId') boardId: string) {
    return this.service.findAll(boardId);
  }

  @Post('boards/:boardId/projects')
  create(@Param('boardId') boardId: string, @Body() dto: CreateProjectDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.create({ ...dto, boardId }, user!);
  }

  @Get('projects/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put('projects/:id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.update(id, dto, user!);
  }

  @Delete('projects/:id')
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser | undefined;
    return this.service.remove(id, user!);
  }
}
