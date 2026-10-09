import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { getToken } from './api';
import type { AttachmentSubjectType } from '@/types';

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
        // TFG-56: a child task's parentage changed — the parent's detail
        // payload embeds its subTasks array, so the parent's detail query
        // must be invalidated too or the detail page shows a stale list.
        // previousParentId (sent only when parentage changed) covers the
        // parent the task moved away from, including un-nest to null.
        // TFG-34: same contract for the project detail payload — its embedded
        // task list must refetch when a task lands in / leaves the project.
        // projectId is null-guarded (task:deleted's payload is just
        // { id, boardId }); `?? null` comparisons keep a null from producing
        // a ['projects', null] key, mirroring previousParentId.
        const task = eventData as {
          id?: string;
          statusId?: string;
          boardId?: string;
          parentId?: string | null;
          previousParentId?: string | null;
          projectId?: string | null;
        };
        if (task.id) {
          queryClient.invalidateQueries({ queryKey: ['tasks', task.id] });
        }
        if (task.parentId) {
          queryClient.invalidateQueries({ queryKey: ['tasks', task.parentId] });
        }
        if (task.previousParentId) {
          queryClient.invalidateQueries({ queryKey: ['tasks', task.previousParentId] });
        }
        if (task.projectId) {
          queryClient.invalidateQueries({ queryKey: ['projects', task.projectId] });
        }
        // The projects list carries a per-project progress rollup. A linked
        // task appearing changes it; task:deleted carries no projectId, so any
        // deletion may have. Plain updates don't — linked-task status moves
        // also emit task.project.updated, handled below.
        if ((eventName === 'task:created' && task.projectId) || eventName === 'task:deleted') {
          queryClient.invalidateQueries({ queryKey: ['projects'], exact: true });
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

      if (eventName === 'attachment:created' || eventName === 'attachment:deleted') {
        const attachment = eventData as { subjectType?: AttachmentSubjectType; subjectId?: string };
        if (attachment.subjectType && attachment.subjectId) {
          queryClient.invalidateQueries({
            queryKey: ['attachments', attachment.subjectType, attachment.subjectId],
          });
          if (attachment.subjectType === 'task') {
            queryClient.invalidateQueries({ queryKey: ['tasks', attachment.subjectId] });
            if (bid) queryClient.invalidateQueries({ queryKey: ['boards', bid, 'full'] });
          }
          if (attachment.subjectType === 'comment') {
            queryClient.invalidateQueries({ queryKey: ['comments'] });
          }
          if (attachment.subjectType === 'document') {
            queryClient.invalidateQueries({ queryKey: ['documents', attachment.subjectId] });
            queryClient.invalidateQueries({ queryKey: ['documents'] });
          }
        }
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

      if (
        eventName === 'view:created' ||
        eventName === 'view:updated' ||
        eventName === 'view:deleted'
      ) {
        const v = eventData as { boardId?: string };
        const target = v.boardId ?? bid;
        if (target) {
          queryClient.invalidateQueries({ queryKey: ['views', target] });
        }
      }

      if (eventName === 'notification:created') {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      }

      if (
        eventName === 'project:created' ||
        eventName === 'project:updated' ||
        eventName === 'project:deleted'
      ) {
        // Projects are workspace-level (v2) and broadcast to every socket, so
        // no board room is involved: refresh the global list and the row's
        // own detail key (project:deleted carries only { id }).
        const p = eventData as { id?: string };
        queryClient.invalidateQueries({ queryKey: ['projects'], exact: true });
        if (p.id) {
          queryClient.invalidateQueries({ queryKey: ['projects', p.id] });
        }
      }

      if (eventName === 'task.project.updated') {
        // TFG-34: the task's project link changed. The payload is the task row
        // plus previousProjectId (the project the task moved AWAY from, null
        // when un-assigning) — mirroring the previousParentId handling above,
        // so a project detail page's embedded task list goes stale on both
        // sides of the move.
        const task = eventData as {
          id?: string;
          boardId?: string;
          projectId?: string | null;
          previousProjectId?: string | null;
        };
        if (task.id) {
          queryClient.invalidateQueries({ queryKey: ['tasks', task.id] });
        }
        // Broadcast globally (v2) — the list's progress rollup moves with it.
        queryClient.invalidateQueries({ queryKey: ['projects'], exact: true });
        if (task.projectId) {
          queryClient.invalidateQueries({ queryKey: ['projects', task.projectId] });
        }
        if (task.previousProjectId) {
          queryClient.invalidateQueries({ queryKey: ['projects', task.previousProjectId] });
        }
        if (task.boardId) {
          queryClient.invalidateQueries({ queryKey: ['tasks', 'board', task.boardId] });
          // The project kanban plans drops from this cache and joins no board
          // room, so task:moved never refreshes it there.
          queryClient.invalidateQueries({ queryKey: ['boards', task.boardId, 'full'] });
        }
        if (bid) {
          queryClient.invalidateQueries({ queryKey: ['tasks', 'board', bid] });
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
      'comment:updated',
      'comment:reaction:toggled',
      'document:created',
      'document:updated',
      'document:deleted',
      'attachment:created',
      'attachment:deleted',
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
      'view:created',
      'view:updated',
      'view:deleted',
      'project:created',
      'project:updated',
      'project:deleted',
      'task.project.updated',
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
