import { useEffect, useState } from 'react';
import type { ViewMode } from './use-board-view-state';

/**
 * useProjectViewMode — the project page's grouped-list | kanban choice,
 * persisted to localStorage per project (mirrors useBoardViewState's
 * per-board layout persistence). Defaults to the grouped list.
 */

const STORAGE_PREFIX = 'taskforge:project-view:';

function load(projectId: string): ViewMode {
  try {
    return localStorage.getItem(STORAGE_PREFIX + projectId) === 'kanban' ? 'kanban' : 'list';
  } catch {
    return 'list';
  }
}

export function useProjectViewMode(projectId: string) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => load(projectId));

  useEffect(() => {
    setViewMode(load(projectId));
  }, [projectId]);

  const update = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(STORAGE_PREFIX + projectId, mode);
    } catch {
      // storage may be unavailable; ignore
    }
  };

  return [viewMode, update] as const;
}
