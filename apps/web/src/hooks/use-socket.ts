import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getToken } from './api';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

export function useSocket(boardId?: string) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<(data: unknown) => void>>>(new Map());

  const on = useCallback((event: string, handler: (data: unknown) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(handler);
    return () => listenersRef.current.get(event)?.delete(handler);
  }, []);

  useEffect(() => {
    const url = boardId ? `${WS_URL}?boardId=${boardId}` : WS_URL;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      const token = getToken();
      if (token) {
        ws.send(JSON.stringify({ type: 'auth', token }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'auth_error') {
          console.error('WebSocket auth failed');
          return;
        }
        if (data.type === 'auth_success') {
          return;
        }
        const { event: eventName, data: eventData } = data;

        // Invalidate relevant react-query caches based on event type
        if (eventName === 'task:created' || eventName === 'task:updated' || eventName === 'task:deleted' || eventName === 'task:moved') {
          const task = eventData as { id?: string; listId?: string; boardId?: string };
          if (task.id) {
            queryClient.invalidateQueries({ queryKey: ['tasks', task.id] });
          }
          if (task.boardId) {
            queryClient.invalidateQueries({ queryKey: ['tasks', 'board', task.boardId] });
          }
          // Invalidate all board queries since task counts may change
          queryClient.invalidateQueries({ queryKey: ['boards'] });
          if (boardId) {
            queryClient.invalidateQueries({ queryKey: ['boards', boardId] });
            queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] });
          }
        }
        if (eventName === 'comment:created' || eventName === 'comment:deleted') {
          const comment = eventData as { taskId?: string };
          if (comment.taskId) {
            queryClient.invalidateQueries({ queryKey: ['comments', comment.taskId] });
          }
        }
        if (eventName === 'label:created' || eventName === 'label:updated' || eventName === 'label:deleted') {
          if (boardId) {
            queryClient.invalidateQueries({ queryKey: ['labels', boardId] });
          }
        }
        if (eventName === 'list:created' || eventName === 'list:updated' || eventName === 'list:deleted' || eventName === 'list:reordered') {
          if (boardId) {
            queryClient.invalidateQueries({ queryKey: ['boards', boardId] });
            queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'full'] });
          }
        }

        const handlers = listenersRef.current.get(eventName);
        handlers?.forEach((h) => h(eventData));
      } catch {
        // ignore malformed messages
      }
    };

    return () => ws.close();
  }, [boardId, queryClient]);

  return { on };
}