import { Controller, Get, Post, Delete, Param, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { MembersService } from './members.service';
import { AddMemberDto } from './dto/member.dto';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api/boards/:boardId/members')
export class MembersController {
  constructor(private readonly service: MembersService) {}

  @Get()
  findAll(@Param('boardId') boardId: string) {
    return this.service.findByBoard(boardId);
  }

  @Post()
  add(
    @Param('boardId') boardId: string,
    @Body() dto: AddMemberDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user as AuthedUser;
    return this.service.addMember(boardId, user.id, dto.userId, dto.role);
  }

  @Delete(':userId')
  remove(
    @Param('boardId') boardId: string,
    @Param('userId') userId: string,
    @Req() req: Request,
  ) {
    const user = (req as any).user as AuthedUser;
    return this.service.removeMember(boardId, user.id, userId);
  }
}

@Controller('api/boards/:boardId')
export class BoardJoinController {
  constructor(private readonly service: MembersService) {}

  @Post('join')
  join(@Param('boardId') boardId: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser;
    return this.service.join(boardId, user.id);
  }

  @Post('leave')
  leave(@Param('boardId') boardId: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser;
    return this.service.leave(boardId, user.id);
  }
}
