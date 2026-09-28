/**
 * useDetailWidth — fixed/full-width toggle state for the task detail page (TFG-59).
 *
 * Fixed (centered, max-w-3xl) is the default; the user's choice persists in
 * localStorage so it survives reloads without a backend change. The toggle
 * button lives in the breadcrumb bar and is hidden on phone viewports
 * (`hidden md:inline-flex`), where fixed vs wide would be indistinguishable.
 */
import { useCallback, useState } from 'react';

export const DETAIL_WIDTH_STORAGE_KEY = 'taskforge:task-detail-wide';

export function useDetailWidth(): [boolean, () => void] {
  const [wide, setWide] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(DETAIL_WIDTH_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setWide((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(DETAIL_WIDTH_STORAGE_KEY, String(next));
      } catch {
        // Private mode / disabled storage — the toggle still works for the session.
      }
      return next;
    });
  }, []);

  return [wide, toggle];
}
