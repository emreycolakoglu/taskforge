import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPublicDocument, PublicDocumentNotFoundError } from './public-api';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

describe('fetchPublicDocument', () => {
  it('fetches a published document', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ title: 'Hello', body: 'world' }),
    });
    const result = await fetchPublicDocument('TFG', '2');
    expect(mockFetch).toHaveBeenCalledWith('/api/public/docs/TFG/2');
    expect(result.title).toBe('Hello');
  });

  it('throws PublicDocumentNotFoundError on 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(fetchPublicDocument('TFG', '99')).rejects.toBeInstanceOf(
      PublicDocumentNotFoundError,
    );
  });
});
