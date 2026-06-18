import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { createTestPrisma } from '../../test/setup';
import { ConflictException } from '@nestjs/common';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      providers: [SettingsService, { provide: PrismaService, useValue: prisma }],
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
    });

    it('should throw ConflictException when no settings exist', async () => {
      await expect(service.updateSettings({ title: 'New Title' })).rejects.toThrow(ConflictException);
    });
  });
});