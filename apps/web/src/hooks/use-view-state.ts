import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBoardViews } from './use-views';
import type { View } from '@/types';

/**
 * useActiveView — resolves the board's active saved view from the `?view=<id>`
 * URL param. A stale param (view deleted, or not on this board) is stripped
 * with `replace: true` so no history entry is left behind. `selectView` is the
 * setter: pass a view id to activate, or null to clear.
 */
export function useActiveView(boardId: string): {
  activeView: View | null;
  selectView: (id: string | null) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get('view');
  const views = useBoardViews(boardId).data ?? [];
  const activeView = views.find((v) => v.id === viewParam) ?? null;

  useEffect(() => {
    if (viewParam && !activeView) {
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      setSearchParams(next, { replace: true });
    }
  }, [viewParam, activeView, searchParams, setSearchParams]);

  return {
    activeView,
    selectView: (id: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (id) next.set('view', id);
      else next.delete('view');
      setSearchParams(next, { replace: true });
    },
  };
}
