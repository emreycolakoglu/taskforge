import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { SettingsService } from '../settings/settings.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { OnboardDto } from './dto/onboard.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const RESET_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
    private settings: SettingsService,
  ) {}

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

  /**
   * Always resolves to the same shape: callers must not be able to tell whether
   * the email exists, whether a cooldown suppressed the send, or whether SMTP is
   * configured. See the design note in the spec.
   */
  async requestPasswordReset(email: string): Promise<{ success: true }> {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      return { success: true };
    }

    const newest = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (newest && newest.createdAt.getTime() > Date.now() - RESET_COOLDOWN_MS) {
      return { success: true };
    }

    await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    if (!(await this.mailer.isConfigured())) {
      return { success: true };
    }

    const title = await this.settings.getTitle();
    const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
    const link = `${origin}/reset-password/${rawToken}`;
    try {
      await this.mailer.send({
        to: user.email,
        subject: `Reset your ${title} password`,
        html: `<p>Someone requested a password reset for your <strong>${title}</strong> account.</p><p><a href="${link}">Set a new password</a> — the link expires in 1 hour. If this wasn't you, ignore this email.</p>`,
        text: `Reset your ${title} password: ${link} (expires in 1 hour).`,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to send password reset email: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { success: true };
  }

  async resetPassword(token: string, password: string): Promise<{ success: true }> {
    if (password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: row.userId, id: { not: row.id } },
      }),
      this.prisma.session.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    return { success: true };
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

  async createInvite(adminId: string, recipientEmail?: string) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (recipientEmail) {
      const configured = await this.mailer.isConfigured();
      if (!configured) {
        throw new BadRequestException('SMTP is not configured');
      }
      const title = await this.settings.getTitle();
      const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
      const link = `${origin}/signup/${token}`;
      const html = `<p>You have been invited to join <strong>${title}</strong>.</p><p><a href="${link}">Accept the invite</a> — the link expires in 7 days.</p>`;
      const text = `You have been invited to join ${title}. Accept the invite: ${link} (expires in 7 days).`;
      try {
        await this.mailer.send({
          to: recipientEmail,
          subject: `Invite to join ${title}`,
          html,
          text,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send invite email';
        throw new BadRequestException(message);
      }
      return this.prisma.inviteToken.create({
        data: { token, createdBy: adminId, expiresAt, recipientEmail },
      });
    }

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

  /**
   * Permanently delete a user. Relations cascade or null out per the schema
   * (sessions/members/subscriptions/notifications cascade; authored comments,
   * activity, and task assignments are set to null). Guards prevent an admin
   * from deleting their own account or removing the last remaining admin, which
   * would otherwise lock everyone out of admin-only features.
   */
  async deleteUser(userId: string, requestingUserId: string): Promise<void> {
    if (userId === requestingUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'admin') {
      const adminCount = await this.prisma.user.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot delete the last admin');
      }
    }

    await this.prisma.user.delete({ where: { id: userId } });
  }

  async findUserDirectory(): Promise<Array<{ id: string; displayName: string }>> {
    return this.prisma.user.findMany({
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });
  }

  async findAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { displayName: 'asc' },
    });
  }

  async findAllInvites() {
    const invites = await this.prisma.inviteToken.findMany({
      include: { creator: true },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return invites.map((invite) => ({
      id: invite.id,
      token: invite.token,
      createdBy: invite.createdBy,
      creatorName: invite.creator.displayName,
      recipientEmail: invite.recipientEmail,
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
