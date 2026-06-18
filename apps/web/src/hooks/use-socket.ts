import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { getToken } from './api';

export function useSocket(boardId?: string) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef<Map<string, Set<(data: unknown) => void>>>(new Map());
  const boardIdRef = useRef(boardId);

  boardIdRef.current = boardId;

  const on = useCallback((event: string, handler: (data: unknown) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(handler);
    return () => listenersRef.current.get(event)?.delete(handler);
  }, []);

  // Create socket once — stays connected regardless of boardId changes
  useEffect(() => {
    const socket = io({
      path: '/ws/',
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      const token = getToken();
      if (token) {
        socket.emit('auth', { token, boardId: boardIdRef.current });
      }
    });

    socket.on('auth_error', () => {
      console.error('WebSocket auth failed');
    });

    socket.on('auth_success', () => {
      // Authenticated successfully
    });

    const invalidateByEvent = (eventName: string, eventData: unknown) => {
      const bid = boardIdRef.current;

      if (
        eventName === 'task:created' ||
        eventName === 'task:updated' ||
        eventName === 'task:deleted' ||
        eventName === 'task:moved'
      ) {
        const task = eventData as { id?: string; listId?: string; boardId?: string };
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

      if (eventName === 'comment:created' || eventName === 'comment:deleted') {
        const comment = eventData as { taskId?: string };
        if (comment.taskId) {
          queryClient.invalidateQueries({ queryKey: ['comments', comment.taskId] });
        }
      }

      if (
        eventName === 'label:created' ||
        eventName === 'label:updated' ||
        eventName === 'label:deleted'
      ) {
        if (bid) {
          queryClient.invalidateQueries({ queryKey: ['labels', bid] });
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
      'label:created',
      'label:updated',
      'label:deleted',
      'list:created',
      'list:updated',
      'list:deleted',
      'list:reordered',
      'board:created',
    ];

    eventTypes.forEach((eventType) => {
      socket.on(eventType, (data: unknown) => {
        invalidateByEvent(eventType, data);
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [queryClient]);

  // Re-join board room when boardId changes (without reconnecting)
  useEffect(() => {
    const socket = socketRef.current;
    if (socket && socket.connected && boardId) {
      const token = getToken();
      if (token) {
        socket.emit('auth', { token, boardId });
      }
    }
  }, [boardId]);

  return { on };
}