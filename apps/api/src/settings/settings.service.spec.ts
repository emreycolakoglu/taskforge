import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { createTestPrisma } from '../../test/setup';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DEFAULT_ALLOWED_MIME_TYPES } from '../storage/storage.types';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailerService, useValue: { send: jest.fn(), isConfigured: jest.fn() } },
      ],
    }).compile();
    service = module.get<SettingsService>(SettingsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.settings.deleteMany();
  });

  describe('isInitialized', () => {
    it('should return false when no settings exist', async () => {
      const result = await service.isInitialized();
      expect(result).toBe(false);
    });

    it('should return true when settings exist with onboarded=true', async () => {
      await prisma.settings.create({
        data: { id: 'singleton', title: 'Test', onboarded: true },
      });
      const result = await service.isInitialized();
      expect(result).toBe(true);
    });

    it('should return false when settings exist with onboarded=false', async () => {
      await prisma.settings.create({
        data: { id: 'singleton', title: 'Test', onboarded: false },
      });
      const result = await service.isInitialized();
      expect(result).toBe(false);
    });
  });

  describe('getTitle', () => {
    it('should return default title when no settings exist', async () => {
      const title = await service.getTitle();
      expect(title).toBe('TaskForge');
    });

    it('should return configured title', async () => {
      await prisma.settings.create({
        data: { id: 'singleton', title: 'My Board', onboarded: true },
      });
      const title = await service.getTitle();
      expect(title).toBe('My Board');
    });
  });

  describe('initialize', () => {
    it('should create settings singleton', async () => {
      const settings = await service.initialize('Test Title');
      expect(settings.title).toBe('Test Title');
      expect(settings.onboarded).toBe(true);
    });

    it('should throw ConflictException if settings already exist', async () => {
      await service.initialize('First Title');
      await expect(service.initialize('Second Title')).rejects.toThrow(ConflictException);
    });
  });

  describe('getSettings', () => {
    it('should return uninitialized state when no settings exist', async () => {
      const result = await service.getSettings();
      expect(result.initialized).toBe(false);
      expect(result.title).toBeNull();
    });

    it('should return initialized settings', async () => {
      await service.initialize('My Board');
      const result = await service.getSettings();
      expect(result.initialized).toBe(true);
      expect(result.title).toBe('My Board');
    });
  });

  describe('updateSettings', () => {
    it('should update settings title', async () => {
      await service.initialize('Old Title');
      const updated = await service.updateSettings({ title: 'New Title' });
      expect(updated.title).toBe('New Title');
      expect('smtpPassword' in updated).toBe(false);
    });

    it('should throw ConflictException when no settings exist', async () => {
      await expect(service.updateSettings({ title: 'New Title' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('SMTP settings', () => {
    async function init() {
      return service.initialize('Test');
    }

    it('should not return the password in the update response', async () => {
      await init();
      const updated = await service.updateSettings({ smtpPassword: 'secret' });
      expect(updated.smtpPasswordSet).toBe(true);
      expect('smtpPassword' in updated).toBe(false);
    });

    it('should return smtpPasswordSet instead of the password', async () => {
      await init();
      await service.updateSettings({ smtpHost: 'smtp.test', smtpPassword: 'secret' });
      const result = await service.getFullSettings();
      expect(result.smtpHost).toBe('smtp.test');
      expect(result.smtpPasswordSet).toBe(true);
      expect('smtpPassword' in result).toBe(false);
    });

    it('should coerce a null smtpFromName to empty string', async () => {
      await service.initialize('Test');
      const updated = await service.updateSettings({ smtpFromName: null });
      expect(updated.smtpFromName).toBe('');
    });

    it('should keep password when absent, clear when empty string', async () => {
      await init();
      await service.updateSettings({ smtpPassword: 'secret' });
      await service.updateSettings({ smtpHost: 'h2' });
      expect(await service.getFullSettings()).toMatchObject({ smtpPasswordSet: true });
      await service.updateSettings({ smtpPassword: '' });
      expect(await service.getFullSettings()).toMatchObject({ smtpPasswordSet: false });
    });

    it('should round-trip all smtp fields', async () => {
      await init();
      await service.updateSettings({
        smtpHost: 'smtp.test',
        smtpPort: 587,
        smtpUsername: 'u',
        smtpFromEmail: 'f@t.dev',
        smtpFromName: 'TF',
        smtpSecure: false,
      });
      expect(await service.getFullSettings()).toMatchObject({
        smtpHost: 'smtp.test',
        smtpPort: 587,
        smtpUsername: 'u',
        smtpFromEmail: 'f@t.dev',
        smtpFromName: 'TF',
        smtpSecure: false,
        smtpPasswordSet: false,
      });
    });
  });

  describe('attachment settings', () => {
    beforeEach(async () => {
      await prisma.settings.create({ data: { id: 'singleton', title: 'T', onboarded: true } });
    });

    it('getFullSettings defaults maxFileSizeMb=10 and full allowlist', async () => {
      const s = await service.getFullSettings();
      expect(s.maxFileSizeMb).toBe(10);
      expect(s.allowedMimeTypes).toContain('image/png');
      expect(s.allowedMimeTypes).toContain('application/pdf');
      expect(s.allowedMimeTypes).not.toContain('image/svg+xml');
    });

    it('PATCH round-trips both fields', async () => {
      const s = await service.updateSettings({
        maxFileSizeMb: 25,
        allowedMimeTypes: ['text/plain'],
      });
      expect(s.maxFileSizeMb).toBe(25);
      expect(s.allowedMimeTypes).toEqual(['text/plain']);
    });

    it('rejects maxFileSizeMb < 1', async () => {
      await expect(service.updateSettings({ maxFileSizeMb: 0 } as any)).rejects.toThrow();
    });

    it('rejects empty allowlist', async () => {
      await expect(service.updateSettings({ allowedMimeTypes: [] } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects malformed MIME entries', async () => {
      await expect(
        service.updateSettings({ allowedMimeTypes: ['not-a-mime'] } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('getFullSettings falls back to defaults when no settings row exists', async () => {
      await prisma.settings.deleteMany();
      const s = await service.getFullSettings();
      expect(s.maxFileSizeMb).toBe(10);
      expect(s.allowedMimeTypes).toEqual(DEFAULT_ALLOWED_MIME_TYPES);
      expect(s.smtpPasswordSet).toBe(false);
      expect(s.onboarded).toBe(false);
    });

    it('updateSettings preserves existing attachment fields not in the payload', async () => {
      await prisma.settings.update({
        where: { id: 'singleton' },
        data: {
          allowedMimeTypes: JSON.stringify(['text/plain']),
          maxFileSizeMb: 25,
        },
      });
      const updated = await service.updateSettings({ title: 'New Title' });
      expect(updated.allowedMimeTypes).toEqual(['text/plain']);
      expect(updated.maxFileSizeMb).toBe(25);
    });

    it('stores allowedMimeTypes verbatim, including uppercase entries', async () => {
      const updated = await service.updateSettings({ allowedMimeTypes: ['IMAGE/PNG'] });
      expect(updated.allowedMimeTypes).toEqual(['IMAGE/PNG']);
    });
  });
});
