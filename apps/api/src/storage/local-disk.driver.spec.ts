import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalDiskDriver } from './local-disk.driver';

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
});
