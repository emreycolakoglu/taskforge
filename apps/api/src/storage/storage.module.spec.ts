import { Test, TestingModule } from '@nestjs/testing';
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
    process.env.ATTACHMENTS_DIR = '/tmp/tf-custom';
    const { LocalDiskDriver: LDD } = await import('./local-disk.driver');
    const driver = new LDD(process.env.ATTACHMENTS_DIR);
    expect(driver).toBeInstanceOf(LocalDiskDriver);
  });
});
