import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('api hook', () => {
  it('should make GET request to boards list', async () => {
    const boards = [{ id: 'b1', name: 'Test Board' }];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(boards),
    });

    const { api } = await import('./api');
    const result = await api.boards.list();

    expect(mockFetch).toHaveBeenCalledWith('/api/boards', expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(result).toEqual(boards);
  });

  it('should make POST request to create board', async () => {
    const newBoard = { id: 'b1', name: 'New Board', slug: 'new-board' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(newBoard),
    });

    const { api } = await import('./api');
    const result = await api.boards.create({ name: 'New Board', slug: 'new-board' });

    expect(mockFetch).toHaveBeenCalledWith('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Board', slug: 'new-board' }),
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

  it('should make GET request to search tasks', async () => {
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
    const result = await api.mcp({ method: 'boards_list', params: {}, id: 1 });

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
});
