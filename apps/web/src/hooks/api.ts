import { API_BASE, Board, List, Task, TaskLabel, Comment, Label, User, AuthStatus, OnboardRequest, AuthResponse, InviteTokenResponse, Invite, Settings, RelationType, RelationEntry, TaskRelations } from '../types';

const TOKEN_KEY = 'taskforge_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { ...headers, ...options?.headers },
  });

  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new Error('Unauthorized');
  }

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  // Auth
  auth: {
    status: () => request<AuthStatus>('/auth/status'),
    onboard: (data: OnboardRequest) =>
      request<AuthResponse>('/auth/onboard', { method: 'POST', body: JSON.stringify(data) }),
    login: (email: string, password: string) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
    signup: (token: string, data: { email: string; password: string; displayName: string }) =>
      request<AuthResponse>(`/auth/signup/${token}`, { method: 'POST', body: JSON.stringify(data) }),
    me: () => request<User>('/auth/me'),
    updateUser: (data: { displayName?: string; currentPassword?: string; newPassword?: string }) =>
      request<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),
    createInvite: () =>
      request<InviteTokenResponse>('/auth/invite', { method: 'POST' }),
    createBotToken: () =>
      request<InviteTokenResponse>('/auth/bot-token', { method: 'POST' }),
    users: () =>
      request<User[]>('/auth/users'),
    invites: () =>
      request<Invite[]>('/auth/invites'),
    revokeInvite: (id: string) =>
      request<{ success: boolean }>(`/auth/invites/${id}`, { method: 'DELETE' }),
  },

  // Settings
  settings: {
    get: () => request<Settings>('/settings'),
    getInitialized: () => request<{ initialized: boolean }>('/settings/initialized'),
    getTitle: () => request<{ title: string }>('/settings/title'),
    update: (data: { title?: string }) =>
      request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  },

  // Boards
  boards: {
    list: () => request<Board[]>('/boards'),
    get: (id: string) => request<Board>(`/boards/${id}`),
    getFull: (id: string) => request<Board>(`/boards/${id}/full`),
    create: (data: { name: string; slug: string; identifier: string; description?: string }) =>
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
    list: (boardId: string, opts?: { include?: 'all' | 'top' | 'sub'; parentId?: string }) => {
      const params = new URLSearchParams();
      if (opts?.include) params.set('include', opts.include);
      if (opts?.parentId !== undefined) params.set('parentId', opts.parentId);
      const qs = params.toString();
      return request<Task[]>(`/tasks/board/${boardId}${qs ? `?${qs}` : ''}`);
    },
    listByList: (listId: string, opts?: { include?: 'all' | 'top' | 'sub'; parentId?: string }) => {
      const params = new URLSearchParams();
      if (opts?.include) params.set('include', opts.include);
      if (opts?.parentId !== undefined) params.set('parentId', opts.parentId);
      const qs = params.toString();
      return request<Task[]>(`/tasks/list/${listId}${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => request<Task>(`/tasks/${id}`),
    search: (q: string) => request<Task[]>(`/tasks/search?q=${encodeURIComponent(q)}`),
    create: (data: { listId: string; title: string; description?: string; priority?: string; assigneeId?: string | null; labelIds?: string[]; parentId?: string | null }) =>
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
    list: (boardId: string) => request<Label[]>(`/boards/${boardId}/labels`),
    create: (boardId: string, data: { name: string; color: string }) =>
      request<Label>(`/boards/${boardId}/labels`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; color?: string }) =>
      request<Label>(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/labels/${id}`, { method: 'DELETE' }),
    attach: (taskId: string, labelId: string) =>
      request<TaskLabel>(`/tasks/${taskId}/labels/${labelId}`, { method: 'POST' }),
    detach: (taskId: string, labelId: string) =>
      request<void>(`/tasks/${taskId}/labels/${labelId}`, { method: 'DELETE' }),
  },

  // Relations
  relations: {
    list: (taskId: string) => request<TaskRelations>(`/tasks/${taskId}/relations`),
    create: (taskId: string, data: { otherTaskId: string; type: RelationType; direction?: 'source' | 'target' }) =>
      request<RelationEntry>(`/tasks/${taskId}/relations`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (taskId: string, relationId: string) =>
      request<{ deleted: boolean }>(`/tasks/${taskId}/relations/${relationId}`, { method: 'DELETE' }),
  },

  // MCP
  mcp: (body: unknown) => request<unknown>('/mcp', { method: 'POST', body: JSON.stringify(body) }),
};