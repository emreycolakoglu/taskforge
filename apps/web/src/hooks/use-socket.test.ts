import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Top-level mocks (hoisted by vitest) ---

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
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

import { useSocket, _resetSocket } from './use-socket';
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
    const connectHandler = calls.find(
      (call) => call[0] === 'connect',
    )?.[1] as (() => void) | undefined;

    expect(connectHandler).toBeDefined();

    // Simulate the socket connecting
    mockSocket.connected = true;
    act(() => {
      connectHandler!();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('auth', {
      token: 'test-token',
      boardId: 'board-42',
    });
  });

  it('should emit auth without boardId when boardId is undefined', () => {
    mockGetToken.mockReturnValue('test-token');

    renderHook(() => useSocket());

    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const connectHandler = calls.find(
      (call) => call[0] === 'connect',
    )?.[1] as (() => void) | undefined;

    mockSocket.connected = true;
    act(() => {
      connectHandler!();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('auth', {
      token: 'test-token',
      boardId: undefined,
    });
  });

  it('should not emit auth when token is null', () => {
    mockGetToken.mockReturnValue(null);

    renderHook(() => useSocket('board-1'));

    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const connectHandler = calls.find(
      (call) => call[0] === 'connect',
    )?.[1] as (() => void) | undefined;

    act(() => {
      connectHandler!();
    });

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('should reuse the singleton socket across renders', () => {
    const { rerender } = renderHook(
      ({ boardId }: { boardId?: string }) => useSocket(boardId),
      { initialProps: { boardId: 'board-1' } },
    );

    const callsAfterMount = vi.mocked(io).mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    // Rerender with different boardId — socket should NOT be recreated
    rerender({ boardId: 'board-2' });

    expect(io).toHaveBeenCalledTimes(callsAfterMount);
  });

  it('should emit auth with new boardId when boardId changes and socket is connected', () => {
    mockGetToken.mockReturnValue('my-token');

    const { rerender } = renderHook(
      ({ boardId }: { boardId?: string }) => useSocket(boardId),
      { initialProps: { boardId: 'board-1' } },
    );

    // Clear the auth emit from initial connect
    mockSocket.emit.mockClear();
    mockSocket.connected = true;

    // Rerender with a new boardId — should emit auth with the new boardId
    rerender({ boardId: 'board-2' });

    expect(mockSocket.emit).toHaveBeenCalledWith('auth', {
      token: 'my-token',
      boardId: 'board-2',
    });
  });

  it('should not emit auth on boardId change when socket is not connected', () => {
    mockGetToken.mockReturnValue('my-token');

    const { rerender } = renderHook(
      ({ boardId }: { boardId?: string }) => useSocket(boardId),
      { initialProps: { boardId: 'board-1' } },
    );

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
    const authErrorHandler = calls.find(
      (call) => call[0] === 'auth_error',
    )?.[1];

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

  it('should invalidate notifications queries on notification:created event', () => {
    mockGetToken.mockReturnValue('tok');
    renderHook(() => useSocket());

    const calls = mockSocket.on.mock.calls as Array<[string, ...unknown[]]>;
    const notifHandler = calls.find((c) => c[0] === 'notification:created')?.[1] as ((data: unknown) => void) | undefined;
    expect(notifHandler).toBeDefined();

    mockQueryClient.invalidateQueries.mockClear();
    act(() => {
      notifHandler!({ id: 'n1' });
    });

    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['notifications'] });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['notifications', 'unread-count'] });
  });
});