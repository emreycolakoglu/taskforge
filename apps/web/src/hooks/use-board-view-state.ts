import { useCallback, useEffect, useState } from 'react';

/**
 * useBoardViewState — client-only board view state.
 *
 * Holds the view mode (kanban/list) and the fallback filter state, persisted to
 * localStorage per board. Used when NO saved view is active; when a saved view
 * is active its own filters/grouping/sorting take precedence (use-view-state).
 * Keeps the board component free of view plumbing. No backend calls.
 */

export type ViewMode = 'kanban' | 'list';

export interface FilterState {
  labelIds: string[];
  assigneeIds: string[];
  priorities: ('low' | 'medium' | 'high' | 'urgent')[];
  dueDateRange: { from: string | null; to: string | null };
  searchQuery: string;
}

const STORAGE_PREFIX = 'taskforge:board-view:';

const EMPTY_FILTERS: FilterState = {
  labelIds: [],
  assigneeIds: [],
  priorities: [],
  dueDateRange: { from: null, to: null },
  searchQuery: '',
};

function loadState(boardId: string): { viewMode: ViewMode; filters: FilterState } {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + boardId);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        viewMode: parsed.viewMode === 'list' ? 'list' : 'kanban',
        filters: {
          labelIds: Array.isArray(parsed.filters?.labelIds) ? parsed.filters.labelIds : [],
          assigneeIds: Array.isArray(parsed.filters?.assigneeIds) ? parsed.filters.assigneeIds : [],
          priorities: Array.isArray(parsed.filters?.priorities) ? parsed.filters.priorities : [],
          dueDateRange: {
            from: parsed.filters?.dueDateRange?.from ?? null,
            to: parsed.filters?.dueDateRange?.to ?? null,
          },
          searchQuery:
            typeof parsed.filters?.searchQuery === 'string' ? parsed.filters.searchQuery : '',
        },
      };
    }
  } catch {
    // ignore corrupt storage
  }
  return { viewMode: 'kanban', filters: { ...EMPTY_FILTERS } };
}

export function useBoardViewState(boardId: string) {
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [filters, setFilters] = useState<FilterState>({ ...EMPTY_FILTERS });

  useEffect(() => {
    const { viewMode: vm, filters: f } = loadState(boardId);
    setViewMode(vm);
    setFilters(f);
  }, [boardId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + boardId, JSON.stringify({ viewMode, filters }));
    } catch {
      // storage may be unavailable; ignore
    }
  }, [boardId, viewMode, filters]);

  const toggleLabelFilter = useCallback((labelId: string) => {
    setFilters((prev) => ({
      ...prev,
      labelIds: prev.labelIds.includes(labelId)
        ? prev.labelIds.filter((id) => id !== labelId)
        : [...prev.labelIds, labelId],
    }));
  }, []);

  const removeFilter = useCallback((labelId: string) => {
    setFilters((prev) => ({ ...prev, labelIds: prev.labelIds.filter((id) => id !== labelId) }));
  }, []);

  const clearFilters = useCallback(() => setFilters({ ...EMPTY_FILTERS }), []);

  return {
    viewMode,
    setViewMode,
    filters,
    toggleLabelFilter,
    removeFilter,
    clearFilters,
  };
}
