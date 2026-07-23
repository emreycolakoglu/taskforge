import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

  async findByBoard(boardId: string) {
    return this.prisma.member.findMany({
      where: { boardId },
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  async isBoardAdmin(boardId: string, userId: string): Promise<boolean> {
    // Global admins are always board admins
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.role === 'admin') return true;

    // Check board-level admin role
    const member = await this.prisma.member.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    return member?.role === 'admin';
  }

  async addMember(boardId: string, actorId: string, targetUserId: string, role: string = 'member') {
    // Check authorization: actor must be board admin or global admin
    const isAdmin = await this.isBoardAdmin(boardId, actorId);
    if (!isAdmin) {
      throw new ForbiddenException('Only board admins can add members');
    }

    // Verify board exists
    const board = await this.prisma.board.findUnique({ where: { id: boardId } });
    if (!board) throw new NotFoundException('Board not found');

    // Verify target user exists
    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) throw new NotFoundException('User not found');

    // Upsert membership (idempotent)
    const member = await this.prisma.member.upsert({
      where: { boardId_userId: { boardId, userId: targetUserId } },
      update: { role },
      create: { boardId, userId: targetUserId, role },
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true } },
      },
    });

    return member;
  }

  async removeMember(boardId: string, actorId: string, targetUserId: string) {
    // Check authorization: actor must be board admin or global admin
    const isAdmin = await this.isBoardAdmin(boardId, actorId);
    if (!isAdmin) {
      throw new ForbiddenException('Only board admins can remove members');
    }

    // Verify membership exists
    const member = await this.prisma.member.findUnique({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
    if (!member) throw new NotFoundException('Member not found');

    // Cannot remove the last admin
    if (member.role === 'admin') {
      const adminCount = await this.prisma.member.count({
        where: { boardId, role: 'admin' },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot remove the last admin of the board');
      }
    }

    await this.prisma.member.delete({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });

    return { success: true };
  }

  async join(boardId: string, userId: string) {
    // Verify board exists
    const board = await this.prisma.board.findUnique({ where: { id: boardId } });
    if (!board) throw new NotFoundException('Board not found');

    // Idempotent join
    const existing = await this.prisma.member.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    if (existing) return existing;

    const member = await this.prisma.member.create({
      data: { boardId, userId, role: 'member' },
      include: {
        user: { select: { id: true, email: true, displayName: true, role: true } },
      },
    });

    return member;
  }

  async leave(boardId: string, userId: string) {
    const member = await this.prisma.member.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    if (!member) return { success: true }; // Idempotent

    // Cannot leave if you're the last admin
    if (member.role === 'admin') {
      const adminCount = await this.prisma.member.count({
        where: { boardId, role: 'admin' },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot leave as the last admin. Transfer admin role first or delete the board.');
      }
    }

    await this.prisma.member.delete({
      where: { boardId_userId: { boardId, userId } },
    });

    return { success: true };
  }
}
