import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

// Module-level singleton: survives React StrictMode mount/unmount/remount cycle
// and avoids EPIPE errors from rapid connect/disconnect cycles.
let socket: Socket | null = null;
const boardConsumers = new Map<symbol, string | undefined>();
let activeBoardId: string | undefined | null = null;
let authRevision = 0;

function desiredBoardId(): string | undefined {
  let desired: string | undefined;
  for (const boardId of boardConsumers.values()) {
    if (boardId) desired = boardId;
  }
  return desired;
}

function emitAuth(token: string, boardId: string | undefined) {
  if (!socket) return;
  authRevision += 1;
  socket.emit('auth', { token, boardId, revision: authRevision });
}

function syncBoardRoom() {
  if (!socket?.connected) return;
  const token = getToken();
  if (!token) return;

  const boardId = desiredBoardId();
  if (boardId === activeBoardId) return;

  emitAuth(token, boardId);
  activeBoardId = boardId;
}

/** Disconnect the authenticated socket before switching sessions. */
export function resetSocket() {
  authRevision += 1;
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  boardConsumers.clear();
  activeBoardId = null;
}

/** @internal Reset singleton for tests */
export function _resetSocket() {
  resetSocket();
}

export function useSocket(boardId?: string) {
  const queryClient = useQueryClient();
  const listenersRef = useRef<Map<string, Set<(data: unknown) => void>>>(new Map());
  const boardIdRef = useRef(boardId);
  const consumerIdRef = useRef<symbol | null>(null);

  if (!consumerIdRef.current) consumerIdRef.current = Symbol();

  boardIdRef.current = boardId;

  const on = useCallback((event: string, handler: (data: unknown) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(handler);
    return () => listenersRef.current.get(event)?.delete(handler);
  }, []);

  // Create or reuse the singleton socket
  useEffect(() => {
    let created = false;
    if (!socket) {
      socket = io({
        path: '/ws/',
        transports: ['polling', 'websocket'],
      });
      activeBoardId = null;
      created = true;
    }

    const currentSocket = socket;
    const connectHandler = () => {
      const token = getToken();
      if (token) {
        const boardId = desiredBoardId();
        emitAuth(token, boardId);
        activeBoardId = boardId;
      }
    };
    currentSocket.on('connect', connectHandler);

    const authErrorHandler = () => {
      console.error('WebSocket auth failed');
    };
    currentSocket.on('auth_error', authErrorHandler);

    const authSuccessHandler = () => {
      // Authenticated successfully
    };
    currentSocket.on('auth_success', authSuccessHandler);

    const invalidateByEvent = (eventName: string, eventData: unknown) => {
      const bid = boardIdRef.current;

      if (
        eventName === 'task:created' ||
        eventName === 'task:updated' ||
        eventName === 'task:deleted' ||
        eventName === 'task:moved'
      ) {
        const task = eventData as { id?: string; statusId?: string; boardId?: string };
        if (task.id) {
          queryClient.invalidateQueries({ queryKey: ['tasks', task.id] });
        }
        if (task.boardId) {
          queryClient.invalidateQueries({ queryKey: ['tasks', 'board', task.boardId] });
        }
        queryClient.invalidateQueries({ queryKey: ['boards'] });
        if (bid) {
          queryClient.invalidateQueries({ queryKey: ['boards', bid] });
          queryClient.invalidateQueries({ queryKey: ['boards', bid, 'full'] });
        }
      }

      if (
        eventName === 'comment:created' ||
        eventName === 'comment:deleted' ||
        eventName === 'comment:updated' ||
        eventName === 'comment:reaction:toggled'
      ) {
        const comment = eventData as { taskId?: string };
        if (comment.taskId) {
          queryClient.invalidateQueries({ queryKey: ['comments', comment.taskId] });
          queryClient.invalidateQueries({ queryKey: ['tasks', comment.taskId] });
        }
      }

      if (
        eventName === 'document:created' ||
        eventName === 'document:updated' ||
        eventName === 'document:deleted'
      ) {
        const doc = eventData as { id?: string; boardId?: string; taskId?: string };
        if (doc.id) queryClient.invalidateQueries({ queryKey: ['documents', doc.id] });
        if (doc.boardId)
          queryClient.invalidateQueries({ queryKey: ['documents', 'board', doc.boardId] });
        if (doc.taskId)
          queryClient.invalidateQueries({ queryKey: ['documents', 'task', doc.taskId] });
      }

      if (
        eventName === 'label:created' ||
        eventName === 'label:updated' ||
        eventName === 'label:deleted'
      ) {
        if (bid) {
          queryClient.invalidateQueries({ queryKey: ['labels', bid] });
          queryClient.invalidateQueries({ queryKey: ['boards', bid, 'full'] });
        }
      }

      if (
        eventName === 'list:created' ||
        eventName === 'list:updated' ||
        eventName === 'list:deleted' ||
        eventName === 'list:reordered'
      ) {
        if (bid) {
          queryClient.invalidateQueries({ queryKey: ['boards', bid] });
          queryClient.invalidateQueries({ queryKey: ['boards', bid, 'full'] });
        }
      }

      if (eventName === 'relation:created' || eventName === 'relation:deleted') {
        const r = eventData as { fromTaskId?: string; toTaskId?: string; boardId?: string };
        if (r.fromTaskId) queryClient.invalidateQueries({ queryKey: ['relations', r.fromTaskId] });
        if (r.toTaskId) queryClient.invalidateQueries({ queryKey: ['relations', r.toTaskId] });
        if (r.boardId) {
          queryClient.invalidateQueries({ queryKey: ['tasks', 'board', r.boardId] });
          queryClient.invalidateQueries({ queryKey: ['boards', r.boardId, 'full'] });
        }
      }

      if (eventName === 'notification:created') {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      }

      // Notify custom listeners
      const handlers = listenersRef.current.get(eventName);
      handlers?.forEach((h) => h(eventData));
    };

    const eventTypes = [
      'task:created',
      'task:updated',
      'task:deleted',
      'task:moved',
      'comment:created',
      'comment:deleted',
      'comment:updated',
      'comment:reaction:toggled',
      'document:created',
      'document:updated',
      'document:deleted',
      'label:created',
      'label:updated',
      'label:deleted',
      'list:created',
      'list:updated',
      'list:deleted',
      'list:reordered',
      'board:created',
      'relation:created',
      'relation:deleted',
      'notification:created',
    ];

    const eventHandlers = new Map<string, (data: unknown) => void>();
    eventTypes.forEach((eventType) => {
      const handler = (data: unknown) => {
        invalidateByEvent(eventType, data);
      };
      eventHandlers.set(eventType, handler);
      currentSocket.on(eventType, handler);
    });

    if (!created && !currentSocket.connected) currentSocket.connect();

    // Don't disconnect on StrictMode cleanup — the singleton persists
    return () => {
      eventTypes.forEach((eventType) => {
        const handler = eventHandlers.get(eventType);
        if (handler) currentSocket.off(eventType, handler);
      });
      currentSocket.off('connect', connectHandler);
      currentSocket.off('auth_error', authErrorHandler);
      currentSocket.off('auth_success', authSuccessHandler);
    };
  }, [queryClient]);

  // Track all consumers so an unscoped hook cannot clear a scoped board room.
  useEffect(() => {
    const consumerId = consumerIdRef.current!;
    boardConsumers.set(consumerId, boardIdRef.current);
    syncBoardRoom();

    return () => {
      boardConsumers.delete(consumerId);
      syncBoardRoom();
    };
  }, []);

  useEffect(() => {
    boardConsumers.set(consumerIdRef.current!, boardId);
    syncBoardRoom();
  }, [boardId]);

  return { on };
}
