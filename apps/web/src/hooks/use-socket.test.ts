import { describe, it, expect } from 'vitest';

describe('useSocket module', () => {
  it('should export a useSocket function', async () => {
    const mod = await import('./use-socket');
    expect(typeof mod.useSocket).toBe('function');
  });

  it('should take one optional parameter', async () => {
    const mod = await import('./use-socket');
    expect(mod.useSocket.length).toBe(1);
  });

  it('should be importable without errors', async () => {
    await expect(import('./use-socket')).resolves.toBeDefined();
  });

  it('should export getToken from api module', async () => {
    const mod = await import('./api');
    expect(typeof mod.getToken).toBe('function');
    expect(typeof mod.setToken).toBe('function');
    expect(typeof mod.clearToken).toBe('function');
  });
});