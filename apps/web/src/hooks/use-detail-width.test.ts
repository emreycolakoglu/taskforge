/**
 * useDetailWidth tests (TFG-59) — fixed/full-width preference for the task
 * detail page. Fixed (centered) is the default; the choice persists in
 * localStorage so it survives reloads without a backend change.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDetailWidth, DETAIL_WIDTH_STORAGE_KEY } from './use-detail-width';

describe('useDetailWidth', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to fixed width when nothing is stored', () => {
    const { result } = renderHook(() => useDetailWidth());

    expect(result.current[0]).toBe(false);
  });

  it('starts wide when the stored preference is wide', () => {
    window.localStorage.setItem(DETAIL_WIDTH_STORAGE_KEY, 'true');
    const { result } = renderHook(() => useDetailWidth());

    expect(result.current[0]).toBe(true);
  });

  it('ignores values other than "true" instead of treating junk as wide', () => {
    window.localStorage.setItem(DETAIL_WIDTH_STORAGE_KEY, 'yes');
    const { result } = renderHook(() => useDetailWidth());

    expect(result.current[0]).toBe(false);
  });

  it('toggles and persists the new preference', () => {
    const { result } = renderHook(() => useDetailWidth());
    const [, toggle] = result.current;

    act(() => toggle());

    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(DETAIL_WIDTH_STORAGE_KEY)).toBe('true');
  });

  it('toggles back to fixed and clears the stored wide preference', () => {
    const { result } = renderHook(() => useDetailWidth());
    const [, toggle] = result.current;

    act(() => toggle());
    act(() => toggle());

    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem(DETAIL_WIDTH_STORAGE_KEY)).toBe('false');
  });

  it('keeps working in-session when localStorage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const { result } = renderHook(() => useDetailWidth());
    expect(result.current[0]).toBe(false);

    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
