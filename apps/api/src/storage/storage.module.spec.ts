import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { STORAGE_DRIVER, StorageDriver } from './storage.types';
import { LocalDiskDriver } from './local-disk.driver';

describe('StorageModule driver factory', () => {
  afterEach(() => {
    delete process.env.STORAGE_DRIVER;
    delete process.env.ATTACHMENTS_DIR;
  });

  it('provides LocalDiskDriver by default', async () => {
    const { StorageModule } = await import('./storage.module');
    const module: TestingModule = await Test.createTestingModule({
      imports: [StorageModule],
    }).compile();
    const driver = module.get<StorageDriver>(STORAGE_DRIVER);
    expect(driver).toBeInstanceOf(LocalDiskDriver);
  });

  it('throws for STORAGE_DRIVER=s3', async () => {
    process.env.STORAGE_DRIVER = 's3';
    const { storageDriverFactory } = await import('./storage.module');
    expect(() => storageDriverFactory()).toThrow('S3 driver not yet implemented');
  });

  it('honors ATTACHMENTS_DIR root', async () => {
    const customRoot = join(mkdtempSync(join(tmpdir(), 'tf-custom-root-')), 'nested');
    process.env.ATTACHMENTS_DIR = customRoot;
    const { storageDriverFactory } = await import('./storage.module');
    const driver = storageDriverFactory();
    expect(driver).toBeInstanceOf(LocalDiskDriver);
    // probe writes into the configured root, not the cwd default
    const src = join(mkdtempSync(join(tmpdir(), 'tf-probe-')), 'src.txt');
    writeFileSync(src, 'probe');
    await driver.put('probe-key.txt', src);
    expect(existsSync(join(customRoot, 'probe-key.txt'))).toBe(true);
    await driver.delete('probe-key.txt');
    rmSync(customRoot, { recursive: true, force: true });
    rmSync(src, { force: true });
  });
});
