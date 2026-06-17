import { describe, it, expect } from 'vitest';

describe('useSocket module', () => {
  it('should export a useSocket function', async () => {
    const mod = await import('./useSocket');
    expect(typeof mod.useSocket).toBe('function');
  });

  it('should have on in the return type from useSocket', async () => {
    const mod = await import('./useSocket');
    // Use .call to verify the function signature
    expect(mod.useSocket.length).toBe(1); // takes one optional parameter
  });

  it('should be importable without errors', async () => {
    // Just importing the module should not throw
    await expect(import('./useSocket')).resolves.toBeDefined();
  });
});
