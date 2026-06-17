import { useEffect, useRef, useCallback } from 'react';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

export function useSocket(boardId?: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  const on = useCallback((event: string, handler: (data: any) => void) => {
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

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { event: eventName, data: eventData } = data;
        const handlers = listenersRef.current.get(eventName);
        handlers?.forEach((h) => h(eventData));
      } catch {}
    };

    return () => ws.close();
  }, [boardId]);

  return { on };
}
