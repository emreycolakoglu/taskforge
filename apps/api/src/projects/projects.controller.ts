/**
 * ProjectsController — REST endpoints for workspace-level projects (v2):
 * list all, read with task rollup, create, update, delete. Writes are open
 * to every authenticated human; bot sessions are rejected by ProjectsService.
 */
import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

interface AuthedUser {
  id: string;
  displayName: string;
  bot: boolean;
}

/**
 * The bot flag lives on the Session, not the User, so it is folded into the
 * user shape here for ProjectsService's gate. MCP passes no flag — agents
 * managing projects over MCP is intended.
 */
function actor(req: Request): AuthedUser {
  const user = (req as any).user as { id: string; displayName: string };
  const session = (req as any).session as { bot?: boolean } | undefined;
  return { ...user, bot: !!session?.bot };
}

@Controller('api')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get('projects')
  findAll() {
    return this.service.findAll();
  }

  @Post('projects')
  create(@Body() dto: CreateProjectDto, @Req() req: Request) {
    return this.service.create(dto, actor(req));
  }

  @Get('projects/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put('projects/:id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @Req() req: Request) {
    return this.service.update(id, dto, actor(req));
  }

  @Delete('projects/:id')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.service.remove(id, actor(req));
  }
}
