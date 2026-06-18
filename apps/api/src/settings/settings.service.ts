import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  async getFullSettings() {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings) {
      return { id: 'singleton', title: 'TaskForge', onboarded: false, createdAt: null, updatedAt: null };
    }
    return settings;
  }

  async getSettings() {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings) return { initialized: false, title: null };
    return { initialized: settings.onboarded, title: settings.title };
  }

  async updateSettings(data: { title?: string }) {
    const settings = await this.prisma.settings.findUnique({ where: { id: 'singleton' } });
    if (!settings) {
      throw new ConflictException('Settings not initialized');
    }
    return this.prisma.settings.update({
      where: { id: 'singleton' },
      data,
    });
  }
}