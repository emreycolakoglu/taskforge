import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  localStorageMock.clear();
});

describe('api', () => {
  it('should make GET request to boards list', async () => {
    const boards = [{ id: 'b1', name: 'Test Board' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(boards),
    });

    const { api } = await import('./api');
    const result = await api.boards.list();

    expect(mockFetch).toHaveBeenCalledWith('/api/boards', expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
    expect(result).toEqual(boards);
  });

  it('should include Authorization header when token exists', async () => {
    localStorageMock.getItem.mockReturnValueOnce('test-token');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: 'b1' }]),
    });

    const { api } = await import('./api');
    await api.boards.list();

    expect(mockFetch).toHaveBeenCalledWith('/api/boards', expect.objectContaining({
      headers: expect.objectContaining({
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('should make POST request to create board', async () => {
    const newBoard = { id: 'b1', name: 'New Board', slug: 'new-board', identifier: 'NB' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(newBoard),
    });

    const { api } = await import('./api');
    const result = await api.boards.create({ name: 'New Board', slug: 'new-board', identifier: 'NB' });

    expect(mockFetch).toHaveBeenCalledWith('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Board', slug: 'new-board', identifier: 'NB' }),
    });
    expect(result.id).toBe('b1');
  });

  it('should make PUT request to move task', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 't1', listId: 'l2' }),
    });

    const { api } = await import('./api');
    const result = await api.tasks.move('t1', { listId: 'l2' });

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/t1/move', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId: 'l2' }),
    });
    expect(result.listId).toBe('l2');
  });

  it('should make DELETE request to remove board', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(undefined),
    });

    const { api } = await import('./api');
    await api.boards.delete('b1');

    expect(mockFetch).toHaveBeenCalledWith('/api/boards/b1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('should throw on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve('Not found'),
    });

    const { api } = await import('./api');
    await expect(api.boards.get('nonexistent')).rejects.toThrow('Not found');
  });

  it('should clear token and call onUnauthorized on 401', async () => {
    const handler = vi.fn();
    const { api, setOnUnauthorized, clearToken } = await import('./api');
    setOnUnauthorized(handler);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    });

    await expect(api.boards.list()).rejects.toThrow('Unauthorized');
    expect(handler).toHaveBeenCalled();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('taskforge_token');

    setOnUnauthorized(null);
  });

  it('should make auth.status request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ onboarded: true, title: 'My Forge' }),
    });

    const { api } = await import('./api');
    const result = await api.auth.status();

    expect(result).toEqual({ onboarded: true, title: 'My Forge' });
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/status', expect.any(Object));
  });

  it('should make auth.login request', async () => {
    const response = { user: { id: '1', email: 'a@b.c' }, session: { token: 'tok', expiresAt: '2026-01-01' } };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const { api } = await import('./api');
    const result = await api.auth.login('a@b.c', 'password');

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.c', password: 'password' }),
    }));
    expect(result.session.token).toBe('tok');
  });

  it('should make auth.onboard request', async () => {
    const response = { user: { id: '1', email: 'a@b.c' }, session: { token: 'tok', expiresAt: '2026-01-01' } };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const { api } = await import('./api');
    await api.auth.onboard({
      email: 'a@b.c',
      password: 'password',
      displayName: 'Admin',
      title: 'My Forge',
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/onboard', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.c', password: 'password', displayName: 'Admin', title: 'My Forge' }),
    }));
  });

  it('should make auth.signup request', async () => {
    const response = { user: { id: '2', email: 'b@c.d' }, session: { token: 'tok2', expiresAt: '2026-01-01' } };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const { api } = await import('./api');
    await api.auth.signup('invite-token', {
      email: 'b@c.d',
      password: 'password',
      displayName: 'Member',
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/signup/invite-token', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'b@c.d', password: 'password', displayName: 'Member' }),
    }));
  });

  it('should make auth.me request', async () => {
    const user = { id: '1', email: 'a@b.c', displayName: 'Admin', role: 'admin' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(user),
    });

    const { api } = await import('./api');
    const result = await api.auth.me();
    expect(result.email).toBe('a@b.c');
  });

  it('should make auth.updateUser request', async () => {
    const updated = { id: '1', email: 'a@b.c', displayName: 'New Name', role: 'admin' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(updated),
    });

    const { api } = await import('./api');
    const result = await api.auth.updateUser({ displayName: 'New Name' });
    expect(result.displayName).toBe('New Name');
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({
      method: 'PATCH',
    }));
  });

  it('should make settings.getInitialized request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ initialized: true }),
    });

    const { api } = await import('./api');
    const result = await api.settings.getInitialized();
    expect(result.initialized).toBe(true);
  });

  it('should make search tasks request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: 't1', title: 'Fix bug' }]),
    });

    const { api } = await import('./api');
    const result = await api.tasks.search('bug');

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/search?q=bug', expect.any(Object));
    expect(result).toHaveLength(1);
  });

  it('should make POST request to add comment', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'c1', body: 'Nice!' }),
    });

    const { api } = await import('./api');
    const result = await api.comments.create({ taskId: 't1', author: 'alice', body: 'Nice!' });

    expect(mockFetch).toHaveBeenCalledWith('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 't1', author: 'alice', body: 'Nice!' }),
    });
    expect(result.body).toBe('Nice!');
  });

  it('should make POST request to MCP endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ jsonrpc: '2.0', result: [] }),
    });

    const { api } = await import('./api');
    const result = await api.mcp({ method: 'boards_list', params: {}, id: 1 }) as { result: unknown[] };

    expect(mockFetch).toHaveBeenCalledWith('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'boards_list', params: {}, id: 1 }),
    });
    expect(result.result).toEqual([]);
  });

  it('should make PUT request to reorder tasks', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: 't1' }, { id: 't2' }]),
    });

    const { api } = await import('./api');
    const result = await api.tasks.reorder([{ id: 't1', position: 1 }, { id: 't2', position: 0 }]);

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id: 't1', position: 1 }, { id: 't2', position: 0 }] }),
    });
  });

  it('getToken, setToken, clearToken manage localStorage', async () => {
    const { getToken, setToken, clearToken } = await import('./api');
    expect(getToken()).toBeNull();

    setToken('abc');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('taskforge_token', 'abc');
    localStorageMock.getItem.mockReturnValueOnce('abc');
    expect(getToken()).toBe('abc');

    clearToken();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('taskforge_token');
  });

  it('should make auth.users request', async () => {
    const users = [
      { id: 'u1', email: 'a@b.c', displayName: 'Alice', role: 'admin', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      { id: 'u2', email: 'b@c.d', displayName: 'Bob', role: 'member', createdAt: '2026-01-02', updatedAt: '2026-01-02' },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(users),
    });

    const { api } = await import('./api');
    const result = await api.auth.users();

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/users', expect.any(Object));
    expect(result).toHaveLength(2);
    expect(result[0].displayName).toBe('Alice');
  });

  it('should make GET request to list labels for a board', async () => {
    const labels = [{ id: 'lb1', boardId: 'b1', name: 'bug', color: '#EF4444', createdAt: '2026-01-01', updatedAt: '2026-01-01' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(labels),
    });

    const { api } = await import('./api');
    const result = await api.labels.list('b1');

    expect(mockFetch).toHaveBeenCalledWith('/api/boards/b1/labels', expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
    expect(result).toEqual(labels);
  });

  it('should make POST request to create a label', async () => {
    const newLabel = { id: 'lb1', boardId: 'b1', name: 'bug', color: '#EF4444', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(newLabel),
    });

    const { api } = await import('./api');
    const result = await api.labels.create('b1', { name: 'bug', color: '#EF4444' });

    expect(mockFetch).toHaveBeenCalledWith('/api/boards/b1/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bug', color: '#EF4444' }),
    });
    expect(result.id).toBe('lb1');
  });

  it('should make PATCH request to update a label', async () => {
    const updated = { id: 'lb1', boardId: 'b1', name: 'feature', color: '#22C55E', createdAt: '2026-01-01', updatedAt: '2026-01-02' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(updated),
    });

    const { api } = await import('./api');
    const result = await api.labels.update('lb1', { name: 'feature' });

    expect(mockFetch).toHaveBeenCalledWith('/api/labels/lb1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'feature' }),
    });
    expect(result.name).toBe('feature');
  });

  it('should make DELETE request to remove a label', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(undefined),
    });

    const { api } = await import('./api');
    await api.labels.delete('lb1');

    expect(mockFetch).toHaveBeenCalledWith('/api/labels/lb1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('should make POST request to attach a label to a task', async () => {
    const taskLabel = { taskId: 't1', labelId: 'lb1', assignedAt: '2026-01-01T00:00:00Z', label: { id: 'lb1', boardId: 'b1', name: 'bug', color: '#EF4444', createdAt: '2026-01-01', updatedAt: '2026-01-01' } };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(taskLabel),
    });

    const { api } = await import('./api');
    const result = await api.labels.attach('t1', 'lb1');

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/t1/labels/lb1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(result.taskId).toBe('t1');
    expect(result.labelId).toBe('lb1');
  });

  it('should make DELETE request to detach a label from a task', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(undefined),
    });

    const { api } = await import('./api');
    await api.labels.detach('t1', 'lb1');

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/t1/labels/lb1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  // ─── Sub-tasks ───────────────────────────────────────────────────────────────

  it('api.tasks.list(boardId, { include: "top" }) → calls /tasks/board/<id>?include=top', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { api } = await import('./api');
    await api.tasks.list('b1', { include: 'top' });

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/board/b1?include=top', expect.any(Object));
  });

  it('api.tasks.list(boardId, { parentId: "t1" }) → calls /tasks/board/<id>?parentId=t1', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const { api } = await import('./api');
    await api.tasks.list('b1', { parentId: 't1' });

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/board/b1?parentId=t1', expect.any(Object));
  });

  it('api.tasks.create({ listId, title, parentId: "p1" }) → POST body includes parentId: "p1"', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 't2', parentId: 'p1' }),
    });

    const { api } = await import('./api');
    const result = await api.tasks.create({ listId: 'l1', title: 'Child', parentId: 'p1' });

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId: 'l1', title: 'Child', parentId: 'p1' }),
    });
    expect(result.parentId).toBe('p1');
  });

  it('api.tasks.update(id, { parentId: null }) → PUT body includes parentId: null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 't1', parentId: null }),
    });

    const { api } = await import('./api');
    const result = await api.tasks.update('t1', { parentId: null });

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/t1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: null }),
    });
    expect(result.parentId).toBeNull();
  });
});