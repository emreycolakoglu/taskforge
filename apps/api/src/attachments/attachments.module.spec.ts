import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AttachmentsModule } from './attachments.module';
import { AttachmentsService } from './attachments.service';
import { STORAGE_DRIVER, StorageDriver } from '../storage/storage.types';
import { LocalDiskDriver } from '../storage/local-disk.driver';
import { PrismaModule } from '../prisma/prisma.module';

describe('AttachmentsModule DI graph', () => {
  let storageRoot: string;
  let dbDir: string;

  beforeAll(() => {
    storageRoot = mkdtempSync(join(tmpdir(), 'tf-att-mod-'));
    dbDir = mkdtempSync(join(tmpdir(), 'tf-att-mod-db-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.ATTACHMENTS_DIR = storageRoot;
    process.env.DATABASE_URL = `file:${join(dbDir, 'test.db')}`;
  });

  afterAll(() => {
    delete process.env.STORAGE_DRIVER;
    delete process.env.ATTACHMENTS_DIR;
    delete process.env.DATABASE_URL;
    rmSync(storageRoot, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('boots the real dependency graph and resolves the storage driver', async () => {
    const module: TestingModule = await Test.createTestingModule({
      // PrismaModule is @Global() but only once it is in the graph — the real
      // app mounts it in AppModule, so the boot test mirrors that composition.
      imports: [PrismaModule, AttachmentsModule],
    }).compile();
    expect(module.get(AttachmentsService)).toBeInstanceOf(AttachmentsService);
    expect(module.get<StorageDriver>(STORAGE_DRIVER)).toBeInstanceOf(LocalDiskDriver);
  });
});
