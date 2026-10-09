import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectViewMode } from './use-project-view-mode';

beforeEach(() => localStorage.clear());

describe('useProjectViewMode', () => {
  it('defaults to the grouped list', () => {
    const { result } = renderHook(() => useProjectViewMode('p1'));
    expect(result.current[0]).toBe('list');
  });

  it('persists the choice per project across remounts', () => {
    const first = renderHook(() => useProjectViewMode('p1'));
    act(() => first.result.current[1]('kanban'));
    expect(first.result.current[0]).toBe('kanban');
    first.unmount();

    expect(renderHook(() => useProjectViewMode('p1')).result.current[0]).toBe('kanban');
    expect(renderHook(() => useProjectViewMode('p2')).result.current[0]).toBe('list');
  });

  it('falls back to the list for an unknown stored value', () => {
    localStorage.setItem('taskforge:project-view:p1', 'grid');
    expect(renderHook(() => useProjectViewMode('p1')).result.current[0]).toBe('list');
  });
});
