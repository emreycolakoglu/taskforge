import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalDiskDriver } from './local-disk.driver';

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      rename: jest.fn(actual.promises.rename.bind(actual.promises)),
    },
  };
});

const renameMock = (jest.requireMock('fs') as any).promises.rename as jest.Mock;

describe('LocalDiskDriver', () => {
  const root = mkdtempSync(join(tmpdir(), 'tf-storage-'));
  const driver = new LocalDiskDriver(root);

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('round-trips a file through put/get', async () => {
    const src = join(root, 'src.txt');
    writeFileSync(src, 'hello');
    await driver.put('k1.txt', src);
    const buf = await driver.get('k1.txt');
    expect(buf.toString()).toBe('hello');
  });

  it('stat returns size and null for missing', async () => {
    const src = join(root, 'src2.txt');
    writeFileSync(src, 'abcde');
    await driver.put('k2.txt', src);
    expect(await driver.stat('k2.txt')).toEqual({ size: 5 });
    expect(await driver.stat('missing')).toBeNull();
  });

  it('delete removes the object', async () => {
    const src = join(root, 'src3.txt');
    writeFileSync(src, 'x');
    await driver.put('k3.txt', src);
    await driver.delete('k3.txt');
    expect(await driver.stat('k3.txt')).toBeNull();
  });

  it('delete of missing key is idempotent', async () => {
    await expect(driver.delete('nope')).resolves.toBeUndefined();
  });

  it('put falls back to copy+delete when rename fails with EXDEV', async () => {
    const otherRoot = mkdtempSync(join(tmpdir(), 'tf-storage-src-'));
    const src = join(otherRoot, 'cross-device.txt');
    writeFileSync(src, 'exdev');
    renameMock.mockClear();
    const renameSpy = renameMock.mockRejectedValueOnce(
      Object.assign(new Error('cross-device link'), { code: 'EXDEV' }),
    );
    try {
      await driver.put('k-exdev.txt', src);
      expect(await driver.get('k-exdev.txt')).toEqual(Buffer.from('exdev'));
      expect(existsSync(src)).toBe(false);
      expect(renameSpy).toHaveBeenCalledTimes(1);
    } finally {
      renameMock.mockRestore();
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });

  it('put rethrows non-EXDEV rename errors', async () => {
    const src = join(root, 'src-enoent.txt');
    renameMock.mockClear();
    const renameSpy = renameMock.mockRejectedValueOnce(
      Object.assign(new Error('gone'), { code: 'ENOENT' }),
    );
    try {
      await expect(driver.put('k-err.txt', src)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      renameMock.mockRestore();
    }
  });

  it('rejects dot keys', async () => {
    await expect(driver.put('.', join(root, 'src.txt'))).rejects.toThrow('Invalid storage key');
    await expect(driver.put('..', join(root, 'src.txt'))).rejects.toThrow('Invalid storage key');
    await expect(driver.get('.')).rejects.toThrow('Invalid storage key');
    await expect(driver.get('..')).rejects.toThrow('Invalid storage key');
    await expect(driver.delete('.')).rejects.toThrow('Invalid storage key');
    await expect(driver.stat('..')).rejects.toThrow('Invalid storage key');
  });
});
