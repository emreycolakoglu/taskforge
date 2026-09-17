import { Global, Module } from '@nestjs/common';
import { STORAGE_DRIVER, StorageDriver } from './storage.types';
import { LocalDiskDriver } from './local-disk.driver';

export function storageDriverFactory(): StorageDriver {
  const driverEnv = process.env.STORAGE_DRIVER;
  if (driverEnv === 's3') {
    throw new Error('S3 driver not yet implemented');
  }
  const root = process.env.ATTACHMENTS_DIR ?? `${process.cwd()}/data/attachments`;
  return new LocalDiskDriver(root);
}

@Global()
@Module({
  providers: [{ provide: STORAGE_DRIVER, useFactory: storageDriverFactory }],
  exports: [STORAGE_DRIVER],
})
export class StorageModule {}
