import { API_BASE, Board, List, Task, Comment, Label } from '../types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  // Boards
  boards: {
    list: () => request<Board[]>('/boards'),
    get: (id: string) => request<Board>(`/boards/${id}`),
    getFull: (id: string) => request<Board>(`/boards/${id}/full`),
    create: (data: { name: string; slug: string; description?: string }) =>
      request<Board>('/boards', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Board>) =>
      request<Board>(`/boards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/boards/${id}`, { method: 'DELETE' }),
  },

  // Lists
  lists: {
    list: (boardId: string) => request<List[]>(`/lists/board/${boardId}`),
    create: (data: { boardId: string; name: string; position?: number; color?: string; wipLimit?: number }) =>
      request<List>('/lists', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<List>) =>
      request<List>(`/lists/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    reorder: (items: { id: string; position: number }[]) =>
      request<List[]>('/lists/reorder', { method: 'PUT', body: JSON.stringify({ items }) }),
    delete: (id: string) => request<void>(`/lists/${id}`, { method: 'DELETE' }),
  },

  // Tasks
  tasks: {
    list: (boardId: string) => request<Task[]>(`/tasks/board/${boardId}`),
    listByList: (listId: string) => request<Task[]>(`/tasks/list/${listId}`),
    get: (id: string) => request<Task>(`/tasks/${id}`),
    search: (q: string) => request<Task[]>(`/tasks/search?q=${encodeURIComponent(q)}`),
    create: (data: { listId: string; title: string; description?: string; priority?: string; assignee?: string; labelIds?: string[] }) =>
      request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Task>) =>
      request<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    move: (id: string, data: { listId: string; position?: number }) =>
      request<Task>(`/tasks/${id}/move`, { method: 'PUT', body: JSON.stringify(data) }),
    reorder: (items: { id: string; position: number }[]) =>
      request<Task[]>('/tasks/reorder', { method: 'PUT', body: JSON.stringify({ items }) }),
    delete: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  },

  // Comments
  comments: {
    list: (taskId: string) => request<Comment[]>(`/comments/task/${taskId}`),
    create: (data: { taskId: string; author: string; body: string }) =>
      request<Comment>('/comments', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/comments/${id}`, { method: 'DELETE' }),
  },

  // Labels
  labels: {
    list: (boardId: string) => request<Label[]>(`/labels/board/${boardId}`),
    create: (data: { boardId: string; name: string; color?: string }) =>
      request<Label>('/labels', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Label>) =>
      request<Label>(`/labels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/labels/${id}`, { method: 'DELETE' }),
  },

  // MCP
  mcp: (body: any) => request<any>('/mcp', { method: 'POST', body: JSON.stringify(body) }),
};
