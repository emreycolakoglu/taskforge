import { useCallback, useEffect, useState } from 'react'

/**
 * useBoardViewState — client-only board view state.
 *
 * Holds the view mode (kanban/list) and active label filters, persisted to
 * localStorage per board. Keeps the board component free of view plumbing.
 * No backend calls — all data comes from useBoardFull.
 */

export type ViewMode = 'kanban' | 'list'

export interface FilterState {
  labelIds: string[]
}

const STORAGE_PREFIX = 'taskforge:board-view:'

function loadState(boardId: string): { viewMode: ViewMode; filters: FilterState } {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + boardId)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        viewMode: parsed.viewMode === 'list' ? 'list' : 'kanban',
        filters: { labelIds: Array.isArray(parsed.filters?.labelIds) ? parsed.filters.labelIds : [] },
      }
    }
  } catch {
    // ignore corrupt storage
  }
  return { viewMode: 'kanban', filters: { labelIds: [] } }
}

export function useBoardViewState(boardId: string) {
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const [filters, setFilters] = useState<FilterState>({ labelIds: [] })

  useEffect(() => {
    const { viewMode: vm, filters: f } = loadState(boardId)
    setViewMode(vm)
    setFilters(f)
  }, [boardId])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFIX + boardId, JSON.stringify({ viewMode, filters }))
    } catch {
      // storage may be unavailable; ignore
    }
  }, [boardId, viewMode, filters])

  const toggleLabelFilter = useCallback((labelId: string) => {
    setFilters((prev) => ({
      labelIds: prev.labelIds.includes(labelId)
        ? prev.labelIds.filter((id) => id !== labelId)
        : [...prev.labelIds, labelId],
    }))
  }, [])

  const removeFilter = useCallback((labelId: string) => {
    setFilters((prev) => ({ labelIds: prev.labelIds.filter((id) => id !== labelId) }))
  }, [])

  const clearFilters = useCallback(() => setFilters({ labelIds: [] }), [])

  return {
    viewMode,
    setViewMode,
    filters,
    toggleLabelFilter,
    removeFilter,
    clearFilters,
  }
}