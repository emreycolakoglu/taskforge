import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Top-level mocks (hoisted by vitest) ---

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
  connect: vi.fn(),
  connected: false,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

const mockQueryClient = {
  invalidateQueries: vi.fn(),
};

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => mockQueryClient),
}));

const mockGetToken = vi.fn<() => string | null>(() => null);
vi.mock('./api', () => ({
  getToken: () => mockGetToken(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

// --- Import after mocks are hoisted ---

import { useSocket, _resetSocket, resetSocket } from './use-socket';
import { io } from 'socket.io-client';

describe('useSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.on.mockReturnThis();
    mockSocket.connected = false;
    mockGetToken.mockReturnValue(null);
    // Reset the module-level singleton so each test gets a fresh socket
    _resetSocket();
  });

  it('should call io with path /ws/ and polling+websocket transports', () => {
    renderHook(() => useSocket());

    expect(io).toHaveBeenCalledWith({
      path: '/ws/',
      transports: ['polling', 'websocket'],
    });
  });

  it('should emit auth with token and boardId on connect', () => {
    mockGetToken.mockReturnValue('test-token');

    renderHook(() => useSocket('board-42'));

    // Find the 'connect' handler registered on the socket
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const connectHandler = calls.find((call) => call[0] === 'connect')?.[1] as
      (() => void) | undefined;

    expect(connectHandler).toBeDefined();

    // Simulate the socket connecting
    mockSocket.connected = true;
    act(() => {
      connectHandler!();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'auth',
      expect.objectContaining({
        token: 'test-token',
        boardId: 'board-42',
      }),
    );
  });

  it('should emit auth without boardId when boardId is undefined', () => {
    mockGetToken.mockReturnValue('test-token');

    renderHook(() => useSocket());

    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const connectHandler = calls.find((call) => call[0] === 'connect')?.[1] as
      (() => void) | undefined;

    mockSocket.connected = true;
    act(() => {
      connectHandler!();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'auth',
      expect.objectContaining({
        token: 'test-token',
        boardId: undefined,
      }),
    );
  });

  it('should not emit auth when token is null', () => {
    mockGetToken.mockReturnValue(null);

    renderHook(() => useSocket('board-1'));

    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const connectHandler = calls.find((call) => call[0] === 'connect')?.[1] as
      (() => void) | undefined;

    act(() => {
      connectHandler!();
    });

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('should reuse the singleton socket across renders', () => {
    const { rerender } = renderHook(({ boardId }: { boardId?: string }) => useSocket(boardId), {
      initialProps: { boardId: 'board-1' },
    });

    const callsAfterMount = vi.mocked(io).mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    // Rerender with different boardId — socket should NOT be recreated
    rerender({ boardId: 'board-2' });

    expect(io).toHaveBeenCalledTimes(callsAfterMount);
  });

  it('should emit auth with new boardId when boardId changes and socket is connected', () => {
    mockGetToken.mockReturnValue('my-token');

    const { rerender } = renderHook(({ boardId }: { boardId?: string }) => useSocket(boardId), {
      initialProps: { boardId: 'board-1' },
    });

    // Clear the auth emit from initial connect
    mockSocket.emit.mockClear();
    mockSocket.connected = true;

    // Rerender with a new boardId — should emit auth with the new boardId
    rerender({ boardId: 'board-2' });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'auth',
      expect.objectContaining({
        token: 'my-token',
        boardId: 'board-2',
      }),
    );
  });

  it('should emit auth without a boardId when boardId changes to undefined', () => {
    mockGetToken.mockReturnValue('my-token');

    const { rerender } = renderHook(({ boardId }: { boardId?: string }) => useSocket(boardId), {
      initialProps: { boardId: 'board-1' as string | undefined },
    });

    mockSocket.emit.mockClear();
    mockSocket.connected = true;
    rerender({ boardId: undefined });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'auth',
      expect.objectContaining({
        token: 'my-token',
        boardId: undefined,
      }),
    );
  });

  it('should not let an unscoped consumer override a scoped board room', () => {
    mockGetToken.mockReturnValue('my-token');
    mockSocket.connected = true;

    renderHook(() => useSocket('board-1'));
    mockSocket.emit.mockClear();

    renderHook(() => useSocket());

    expect(
      mockSocket.emit.mock.calls.some(
        ([event, data]) => event === 'auth' && data.boardId === undefined,
      ),
    ).toBe(false);
  });

  it('should leave the scoped room when its last scoped consumer unmounts', () => {
    mockGetToken.mockReturnValue('my-token');
    mockSocket.connected = true;

    renderHook(() => useSocket());
    const scoped = renderHook(() => useSocket('board-1'));
    mockSocket.emit.mockClear();

    scoped.unmount();

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'auth',
      expect.objectContaining({
        token: 'my-token',
        boardId: undefined,
      }),
    );
  });

  it('should disconnect the singleton socket when reset for a new session', () => {
    renderHook(() => useSocket());
    mockSocket.disconnect.mockClear();
    mockSocket.removeAllListeners.mockClear();

    resetSocket();

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(mockSocket.removeAllListeners).toHaveBeenCalledTimes(1);
  });

  it('should create a fresh socket after resetting the previous session', () => {
    renderHook(() => useSocket());
    resetSocket();

    renderHook(() => useSocket());

    expect(io).toHaveBeenCalledTimes(2);
  });

  it('should add a newer revision to every auth emission', () => {
    mockGetToken.mockReturnValue('my-token');

    const { rerender } = renderHook(({ boardId }: { boardId?: string }) => useSocket(boardId), {
      initialProps: { boardId: 'board-1' },
    });
    const connectHandler = (mockSocket.on.mock.calls as Array<[string, ...unknown[]]>).find(
      ([event]) => event === 'connect',
    )?.[1] as (() => void) | undefined;

    mockSocket.connected = true;
    act(() => connectHandler!());
    rerender({ boardId: 'board-2' });

    const authMessages = mockSocket.emit.mock.calls
      .filter(([event]) => event === 'auth')
      .map(([, data]) => data as { revision: number });
    expect(authMessages).toHaveLength(2);
    expect(authMessages[0].revision).toBeLessThan(authMessages[1].revision);
  });

  it('should emit auth with a newer revision after reconnecting', () => {
    mockGetToken.mockReturnValue('my-token');
    renderHook(() => useSocket('board-1'));
    const connectHandler = (mockSocket.on.mock.calls as Array<[string, ...unknown[]]>).find(
      ([event]) => event === 'connect',
    )?.[1] as (() => void) | undefined;

    mockSocket.connected = true;
    act(() => connectHandler!());
    const firstRevision = (mockSocket.emit.mock.calls.at(-1)?.[1] as { revision: number }).revision;

    mockSocket.emit.mockClear();
    act(() => connectHandler!());

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'auth',
      expect.objectContaining({ boardId: 'board-1', revision: expect.any(Number) }),
    );
    const secondRevision = (mockSocket.emit.mock.calls[0][1] as { revision: number }).revision;
    expect(secondRevision).toBeGreaterThan(firstRevision);
  });

  it('should not emit auth on boardId change when socket is not connected', () => {
    mockGetToken.mockReturnValue('my-token');

    const { rerender } = renderHook(({ boardId }: { boardId?: string }) => useSocket(boardId), {
      initialProps: { boardId: 'board-1' },
    });

    mockSocket.emit.mockClear();
    mockSocket.connected = false;

    rerender({ boardId: 'board-2' });

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('should not disconnect the singleton socket on unmount', () => {
    const { unmount } = renderHook(() => useSocket());

    // Clear disconnect calls from any prior setup (e.g. _resetSocket)
    mockSocket.disconnect.mockClear();

    unmount();

    // Singleton socket persists across mount/unmount cycles
    expect(mockSocket.disconnect).not.toHaveBeenCalled();
  });

  it('should register auth_error handler', () => {
    renderHook(() => useSocket());

    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const authErrorHandler = calls.find((call) => call[0] === 'auth_error')?.[1];

    expect(authErrorHandler).toBeDefined();
  });

  it('should remove event listeners on unmount without disconnecting', () => {
    const { unmount } = renderHook(() => useSocket());

    mockSocket.disconnect.mockClear();
    mockSocket.off.mockClear();

    unmount();

    // Should have called .off() for each event type + connect/auth_error/auth_success
    expect(mockSocket.off).toHaveBeenCalled();
    // But should NOT have called .disconnect()
    expect(mockSocket.disconnect).not.toHaveBeenCalled();
  });

  it("should not remove another hook's event listeners on unmount", () => {
    const first = renderHook(() => useSocket());
    const second = renderHook(() => useSocket());
    const commentHandlers = (mockSocket.on.mock.calls as Array<[string, ...unknown[]]>)
      .filter((call) => call[0] === 'comment:created')
      .map((call) => call[1]);

    expect(commentHandlers).toHaveLength(2);
    mockSocket.off.mockClear();
    first.unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('comment:created', commentHandlers[0]);
    expect(mockSocket.off).not.toHaveBeenCalledWith('comment:created', commentHandlers[1]);

    second.unmount();
  });

  it('invalidates the parent task detail query on task:created with parentId', () => {
    mockGetToken.mockReturnValue('tok');
    renderHook(() => useSocket());
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const taskHandler = calls.find((c) => c[0] === 'task:created')?.[1] as
      ((data: unknown) => void) | undefined;
    expect(taskHandler).toBeDefined();

    mockQueryClient.invalidateQueries.mockClear();
    act(() => {
      taskHandler!({ id: 'child-1', parentId: 'parent-1', boardId: 'b1' });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['tasks', 'parent-1'],
    });
  });

  it('invalidates the parent task detail query on task:updated with parentId', () => {
    mockGetToken.mockReturnValue('tok');
    renderHook(() => useSocket());
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const taskHandler = calls.find((c) => c[0] === 'task:updated')?.[1] as
      ((data: unknown) => void) | undefined;
    expect(taskHandler).toBeDefined();

    mockQueryClient.invalidateQueries.mockClear();
    act(() => {
      taskHandler!({ id: 'child-1', parentId: 'parent-1', boardId: 'b1' });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['tasks', 'parent-1'],
    });
  });

  it('invalidates the previous parent task detail query on task:updated with previousParentId', () => {
    mockGetToken.mockReturnValue('tok');
    renderHook(() => useSocket());
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const taskHandler = calls.find((c) => c[0] === 'task:updated')?.[1] as
      ((data: unknown) => void) | undefined;
    expect(taskHandler).toBeDefined();

    mockQueryClient.invalidateQueries.mockClear();
    act(() => {
      // Re-parent A → B: previousParentId is the old parent A (null when un-nesting).
      taskHandler!({
        id: 'child-1',
        parentId: 'parent-b',
        previousParentId: 'parent-a',
        boardId: 'b1',
      });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['tasks', 'parent-a'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['tasks', 'parent-b'],
    });
  });

  it('does not invalidate a parent query when the task has no parentId', () => {
    mockGetToken.mockReturnValue('tok');
    renderHook(() => useSocket());
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const taskHandler = calls.find((c) => c[0] === 'task:created')?.[1] as
      ((data: unknown) => void) | undefined;
    expect(taskHandler).toBeDefined();

    mockQueryClient.invalidateQueries.mockClear();
    act(() => {
      taskHandler!({ id: 'task-1', boardId: 'b1' });
    });

    expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['tasks', null],
    });
  });

  it('invalidates the project detail query on task:created with projectId (TFG-34)', () => {
    mockGetToken.mockReturnValue('tok');
    renderHook(() => useSocket('b1'));
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const taskHandler = calls.find((c) => c[0] === 'task:created')?.[1] as
      ((data: unknown) => void) | undefined;
    expect(taskHandler).toBeDefined();

    mockQueryClient.invalidateQueries.mockClear();
    act(() => {
      taskHandler!({ id: 'task-1', projectId: 'proj-1', boardId: 'b1' });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['projects', 'proj-1'],
    });
    // The list carries a per-project progress rollup — it goes stale too.
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['projects'],
      exact: true,
    });
  });

  it('does not invalidate a project query on task:created without projectId', () => {
    mockGetToken.mockReturnValue('tok');
    renderHook(() => useSocket('b1'));
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const taskHandler = calls.find((c) => c[0] === 'task:created')?.[1] as
      ((data: unknown) => void) | undefined;
    expect(taskHandler).toBeDefined();

    mockQueryClient.invalidateQueries.mockClear();
    // task:deleted carries no projectId at all — no ['projects', null] key may
    // be produced by the same shared handler block.
    act(() => {
      taskHandler!({ id: 'task-1', boardId: 'b1' });
    });

    expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['projects', null],
    });
  });

  it('invalidates notifications queries on notification:created event', () => {
    mockGetToken.mockReturnValue('tok');
    renderHook(() => useSocket());

    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const notifHandler = calls.find((c) => c[0] === 'notification:created')?.[1] as
      ((data: unknown) => void) | undefined;
    expect(notifHandler).toBeDefined();

    mockQueryClient.invalidateQueries.mockClear();
    act(() => {
      notifHandler!({ id: 'n1' });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['notifications', 'unread-count'],
    });
  });

  it('invalidates document queries on document:created', () => {
    renderHook(() => useSocket());
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const docHandler = calls.find((c) => c[0] === 'document:created')?.[1] as
      ((data: unknown) => void) | undefined;
    expect(docHandler).toBeDefined();

    mockQueryClient.invalidateQueries.mockClear();
    act(() => {
      docHandler!({ id: 'd1', boardId: 'b1', taskId: 't1' });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'd1'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'board', 'b1'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'task', 't1'],
    });
  });

  it('invalidates document queries on document:deleted', () => {
    renderHook(() => useSocket());
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const docHandler = calls.find((c) => c[0] === 'document:deleted')?.[1] as
      ((data: unknown) => void) | undefined;
    expect(docHandler).toBeDefined();

    mockQueryClient.invalidateQueries.mockClear();
    act(() => {
      docHandler!({ id: 'd1', boardId: 'b1', taskId: 't1' });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'd1'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'board', 'b1'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'task', 't1'],
    });
  });

  it('invalidates the project documents list on a project document event', () => {
    renderHook(() => useSocket());
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;

    for (const eventName of ['document:created', 'document:updated', 'document:deleted']) {
      const handler = calls.find((c) => c[0] === eventName)?.[1] as
        ((data: unknown) => void) | undefined;
      mockQueryClient.invalidateQueries.mockClear();
      // Project docs carry projectId and null board/task (broadcast globally).
      act(() => handler!({ id: 'd1', boardId: null, taskId: null, projectId: 'p1' }));
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['documents', 'project', 'p1'],
      });
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['documents', 'd1'],
      });
    }
  });

  it('invalidates the project documents list on project:deleted', () => {
    renderHook(() => useSocket());
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const handler = calls.find((c) => c[0] === 'project:deleted')?.[1] as
      ((data: unknown) => void) | undefined;

    mockQueryClient.invalidateQueries.mockClear();
    // Project delete removes its docs without emitting document:deleted.
    act(() => handler!({ id: 'p1' }));
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'project', 'p1'],
    });
  });

  it('invalidates comment attachment queries through the parent task query prefixes', () => {
    renderHook(() => useSocket());
    const attachmentHandler = (mockSocket.on.mock.calls as Array<[string, ...unknown[]]>).find(
      ([event]) => event === 'attachment:created',
    )?.[1] as ((data: unknown) => void) | undefined;

    expect(attachmentHandler).toBeDefined();
    mockQueryClient.invalidateQueries.mockClear();
    act(() => attachmentHandler!({ subjectType: 'comment', subjectId: 'c1' }));

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['attachments', 'comment', 'c1'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['comments'] });
  });

  it('invalidates the active board-full query when a task attachment changes', () => {
    renderHook(() => useSocket('b1'));
    const attachmentHandler = (mockSocket.on.mock.calls as Array<[string, ...unknown[]]>).find(
      ([event]) => event === 'attachment:created',
    )?.[1] as ((data: unknown) => void) | undefined;

    expect(attachmentHandler).toBeDefined();
    mockQueryClient.invalidateQueries.mockClear();
    act(() => attachmentHandler!({ subjectType: 'task', subjectId: 't1' }));

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['boards', 'b1', 'full'],
    });
  });

  it('invalidates document attachment detail and list query prefixes', () => {
    renderHook(() => useSocket());
    const attachmentHandler = (mockSocket.on.mock.calls as Array<[string, ...unknown[]]>).find(
      ([event]) => event === 'attachment:deleted',
    )?.[1] as ((data: unknown) => void) | undefined;

    expect(attachmentHandler).toBeDefined();
    mockQueryClient.invalidateQueries.mockClear();
    act(() => attachmentHandler!({ subjectType: 'document', subjectId: 'd1' }));

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['attachments', 'document', 'd1'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['documents', 'd1'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['documents'] });
  });

  it('invalidates the global projects list + detail on project:* with no board room (v2)', () => {
    // Projects are workspace-level and broadcast to every socket — a global
    // page (no boardId) must still invalidate both keys.
    renderHook(() => useSocket());
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;

    for (const eventName of ['project:created', 'project:updated', 'project:deleted']) {
      const handler = calls.find((c) => c[0] === eventName)?.[1] as
        ((data: unknown) => void) | undefined;
      expect(handler).toBeDefined();

      mockQueryClient.invalidateQueries.mockClear();
      act(() => handler!({ id: 'p1' }));
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['projects'],
        exact: true,
      });
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['projects', 'p1'],
      });
    }
  });

  it('never keys project invalidation by board id (v2: no board fallback)', () => {
    renderHook(() => useSocket('b1'));
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const deletedHandler = calls.find((c) => c[0] === 'project:deleted')?.[1] as
      ((data: unknown) => void) | undefined;

    mockQueryClient.invalidateQueries.mockClear();
    act(() => deletedHandler!({ id: 'p1' }));
    expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['projects', 'b1'],
    });
  });

  it('refreshes the projects list progress on task.project.updated from a global page', () => {
    renderHook(() => useSocket());
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const handler = calls.find((c) => c[0] === 'task.project.updated')?.[1] as
      ((data: unknown) => void) | undefined;

    mockQueryClient.invalidateQueries.mockClear();
    act(() => handler!({ id: 't1', projectId: 'p1', previousProjectId: null, boardId: 'b1' }));
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['projects'],
      exact: true,
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['projects', 'p1'],
    });
  });

  it("refreshes the task's board-full cache on task.project.updated from a roomless page", () => {
    // The project kanban plans drops from ['boards', id, 'full'] but joins no
    // board room, so task:moved never reaches it — this global event must.
    renderHook(() => useSocket());
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const handler = calls.find((c) => c[0] === 'task.project.updated')?.[1] as
      ((data: unknown) => void) | undefined;

    mockQueryClient.invalidateQueries.mockClear();
    act(() => handler!({ id: 't1', projectId: 'p1', previousProjectId: 'p1', boardId: 'b9' }));
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['boards', 'b9', 'full'],
    });
  });

  it('refreshes the projects list on task:deleted (payload has no projectId)', () => {
    renderHook(() => useSocket());
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const handler = calls.find((c) => c[0] === 'task:deleted')?.[1] as
      ((data: unknown) => void) | undefined;

    mockQueryClient.invalidateQueries.mockClear();
    act(() => handler!({ id: 't1', boardId: 'b1' }));
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['projects'],
      exact: true,
    });
  });

  it('invalidates task and both project queries on task.project.updated', () => {
    renderHook(() => useSocket('b1'));
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const handler = calls.find((c) => c[0] === 'task.project.updated')?.[1] as
      ((data: unknown) => void) | undefined;
    expect(handler).toBeDefined();

    mockQueryClient.invalidateQueries.mockClear();
    // Task moved from project p-old to p-new.
    act(() =>
      handler!({ id: 't1', projectId: 'p-new', previousProjectId: 'p-old', boardId: 'b1' }),
    );

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tasks', 't1'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['projects', 'p-new'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['projects', 'p-old'],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['tasks', 'board', 'b1'],
    });
  });

  it('only invalidates the board task list when un-assigning via task.project.updated', () => {
    renderHook(() => useSocket('b1'));
    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const handler = calls.find((c) => c[0] === 'task.project.updated')?.[1] as
      ((data: unknown) => void) | undefined;

    mockQueryClient.invalidateQueries.mockClear();
    // previousProjectId null (never assigned) and projectId null (un-assign) —
    // neither may invalidate a ['projects', null] key.
    act(() => handler!({ id: 't1', projectId: null, previousProjectId: null, boardId: 'b1' }));

    expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['projects', null],
    });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['tasks', 'board', 'b1'],
    });
  });
});
