import { API_BASE, PublicTask } from '../types';

/**
 * Fetch for the public task page — deliberately NOT the shared `api` client.
 *
 * This is not stylistic duplication. `hooks/api.ts` sends a bearer token and, on
 * any 401, clears the stored token and fires `onUnauthorized`, which AuthProvider
 * wires to a redirect to /login. Routing an anonymous page through it would bounce
 * visitors to a login screen — and would log a signed-in colleague out of their
 * own session just for opening a public link.
 *
 * So: no Authorization header, no 401 handler, no shared state. Anonymous means
 * anonymous.
 */

export class PublicTaskNotFoundError extends Error {
  constructor() {
    super('Task not found');
    this.name = 'PublicTaskNotFoundError';
  }
}

export async function fetchPublicTask(identifier: string, number: string): Promise<PublicTask> {
  const res = await fetch(`${API_BASE}/public/tasks/${encodeURIComponent(identifier)}/${encodeURIComponent(number)}`);

  // The API returns 404 both for "no such task" and "not published" — the two are
  // deliberately indistinguishable, so there is nothing to tell apart here either.
  if (res.status === 404) throw new PublicTaskNotFoundError();
  if (!res.ok) throw new Error(await res.text());

  return res.json();
}
