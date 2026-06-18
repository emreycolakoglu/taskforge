import { Injectable, ConflictException, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { OnboardDto } from './dto/onboard.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async isInitialized(): Promise<boolean> {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    return !!settings?.onboarded;
  }

  async getInstanceTitle(): Promise<string> {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    return settings?.title ?? 'TaskForge';
  }

  async onboard(dto: OnboardDto) {
    const alreadyInitialized = await this.isInitialized();
    if (alreadyInitialized) {
      throw new ConflictException('Onboarding has already been completed');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        displayName: dto.displayName,
        role: 'admin',
      },
    });

    await this.prisma.settings.upsert({
      where: { id: 'singleton' },
      update: { title: dto.title, onboarded: true },
      create: { id: 'singleton', title: dto.title, onboarded: true },
    });

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const session = await this.prisma.session.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Add user as admin member to all existing boards
    const boards = await this.prisma.board.findMany();
    for (const board of boards) {
      const existing = await this.prisma.member.findUnique({
        where: { boardId_userId: { boardId: board.id, userId: user.id } },
      });
      if (!existing) {
        await this.prisma.member.create({
          data: { boardId: board.id, userId: user.id, role: 'admin' },
        });
      }
    }

    const { passwordHash: _, ...userResponse } = user;
    return { user: userResponse, session: { token: session.token, expiresAt: session.expiresAt } };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const session = await this.prisma.session.create({
      data: { token, userId: user.id, expiresAt },
    });

    const { passwordHash, ...userResponse } = user;
    return { user: userResponse, session: { token: session.token, expiresAt: session.expiresAt } };
  }

  async logout(token: string): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { token } });
    if (!session) return;
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
  }

  async validateSession(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.revokedAt || new Date(session.expiresAt) < new Date()) {
      return null;
    }

    const { passwordHash, ...user } = session.user;
    return user;
  }

  async createInvite(adminId: string) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return this.prisma.inviteToken.create({
      data: { token, createdBy: adminId, expiresAt },
    });
  }

  async signup(inviteToken: string, dto: SignupDto) {
    const invite = await this.prisma.inviteToken.findUnique({
      where: { token: inviteToken },
    });
    if (!invite) {
      throw new NotFoundException('Invite token not found');
    }
    if (invite.usedBy) {
      throw new BadRequestException('Invite token has already been used');
    }
    if (new Date(invite.expiresAt) < new Date()) {
      throw new BadRequestException('Invite token has expired');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        displayName: dto.displayName,
        role: 'member',
      },
    });

    await this.prisma.inviteToken.update({
      where: { id: invite.id },
      data: { usedBy: user.id, usedAt: new Date() },
    });

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const session = await this.prisma.session.create({
      data: { token, userId: user.id, expiresAt },
    });

    const { passwordHash: _, ...userResponse } = user;
    return { user: userResponse, session: { token: session.token, expiresAt: session.expiresAt } };
  }

  async createBotToken(adminId: string) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const session = await this.prisma.session.create({
      data: { token, userId: adminId, bot: true, expiresAt },
    });
    return { id: session.id, token: session.token, expiresAt: session.expiresAt };
  }

  async updateUser(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const data: { displayName?: string; passwordHash?: string } = {};
    if (dto.displayName !== undefined) {
      data.displayName = dto.displayName;
    }
    if (dto.newPassword !== undefined) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password is required to change password');
      }
      const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      data.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    const { passwordHash, ...userResponse } = updated;
    return userResponse;
  }

  async findAllUsers() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, displayName: true, role: true, createdAt: true, updatedAt: true },
      orderBy: { displayName: 'asc' },
    });
  }

  async findAllInvites() {
    const invites = await this.prisma.inviteToken.findMany({
      include: { creator: true },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return invites.map(invite => ({
      id: invite.id,
      token: invite.token,
      createdBy: invite.createdBy,
      creatorName: invite.creator.displayName,
      usedBy: invite.usedBy,
      usedAt: invite.usedAt,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      isExpired: invite.expiresAt < now,
      isUsed: invite.usedAt !== null,
    }));
  }

  async revokeInvite(id: string) {
    const invite = await this.prisma.inviteToken.findUnique({ where: { id } });
    if (!invite) {
      throw new NotFoundException('Invite token not found');
    }
    if (invite.usedAt !== null) {
      throw new BadRequestException('Cannot revoke an already-used invite token');
    }
    await this.prisma.inviteToken.delete({ where: { id } });
  }

}