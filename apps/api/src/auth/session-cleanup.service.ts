import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(private prisma: PrismaService) {}

  @Cron('0 3 * * *')
  async cleanupSessions() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const expired = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    const revoked = await this.prisma.session.deleteMany({
      where: { revokedAt: { not: null, lt: thirtyDaysAgo } },
    });

    const expiredInvites = await this.prisma.inviteToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    const usedInvites = await this.prisma.inviteToken.deleteMany({
      where: { usedAt: { not: null } },
    });

    this.logger.log(
      `Cleaned up ${expired.count} expired sessions, ${revoked.count} old revoked sessions, ` +
      `${expiredInvites.count} expired invites, ${usedInvites.count} used invites`,
    );
  }
}