import { Injectable, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async isInitialized(): Promise<boolean> {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    return !!settings?.onboarded;
  }

  async getTitle(): Promise<string> {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    return settings?.title ?? 'TaskForge';
  }

  async initialize(title: string) {
    const existing = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (existing) {
      throw new ConflictException('Settings already initialized');
    }
    return this.prisma.settings.create({
      data: { id: 'singleton', title, onboarded: true },
    });
  }

  /**
   * Admin-facing settings view. smtpPassword never leaves the server;
   * smtpPasswordSet reports whether one is stored.
   */
  async getFullSettings() {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings) {
      return {
        id: 'singleton',
        title: 'TaskForge',
        onboarded: false,
        smtpHost: null,
        smtpPort: null,
        smtpUsername: null,
        smtpPasswordSet: false,
        smtpFromEmail: null,
        smtpFromName: 'TaskForge',
        smtpSecure: true,
        createdAt: null,
        updatedAt: null,
      };
    }
    const { smtpPassword, ...rest } = settings;
    return { ...rest, smtpPasswordSet: !!smtpPassword };
  }

  /**
   * Internal SMTP view carrying smtpPassword; consumed by MailerService only.
   */
  async getSmtpConfig() {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings) {
      return {
        smtpHost: null,
        smtpPort: null,
        smtpUsername: null,
        smtpPassword: null,
        smtpFromEmail: null,
        smtpFromName: 'TaskForge',
        smtpSecure: true,
      };
    }
    const {
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPassword,
      smtpFromEmail,
      smtpFromName,
      smtpSecure,
    } = settings;
    return {
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPassword,
      smtpFromEmail,
      smtpFromName,
      smtpSecure,
    };
  }

  async getSettings() {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings) return { initialized: false, title: null };
    return { initialized: settings.onboarded, title: settings.title };
  }

  /**
   * Password semantics: absent = keep, '' = clear, non-empty = set.
   * Other smtp fields: absent = unchanged, null = clear.
   */
  async updateSettings(data: UpdateSettingsDto) {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings) {
      throw new ConflictException('Settings not initialized');
    }
    const { smtpPassword, ...rest } = data;
    const dbData: Prisma.SettingsUpdateInput = { ...rest };
    if (rest.smtpFromName === null) {
      dbData.smtpFromName = '';
    }
    if (smtpPassword === '') {
      dbData.smtpPassword = null;
    } else if (smtpPassword !== undefined) {
      dbData.smtpPassword = smtpPassword;
    }
    await this.prisma.settings.update({ where: { id: 'singleton' }, data: dbData });
    return this.getFullSettings();
  }
}
