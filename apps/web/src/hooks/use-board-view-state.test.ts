import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBoardViewState } from './use-board-view-state';

describe('useBoardViewState — assignee filters', () => {
  it('toggles an assignee on and off', () => {
    const { result } = renderHook(() => useBoardViewState('b1'));

    act(() => result.current.toggleAssigneeFilter('u1'));
    expect(result.current.filters.assigneeIds).toEqual(['u1']);

    act(() => result.current.toggleAssigneeFilter('u1'));
    expect(result.current.filters.assigneeIds).toEqual([]);
  });

  it('removeFilter removes by kind without touching the other kind', () => {
    const { result } = renderHook(() => useBoardViewState('b1'));

    act(() => result.current.toggleLabelFilter('l1'));
    act(() => result.current.toggleAssigneeFilter('u1'));

    act(() => result.current.removeFilter('u1', 'assignee'));
    expect(result.current.filters.assigneeIds).toEqual([]);
    expect(result.current.filters.labelIds).toEqual(['l1']);

    act(() => result.current.removeFilter('l1', 'label'));
    expect(result.current.filters.labelIds).toEqual([]);
  });

  it('clearFilters resets assigneeIds too', () => {
    const { result } = renderHook(() => useBoardViewState('b1'));

    act(() => result.current.toggleAssigneeFilter('u1'));
    act(() => result.current.clearFilters());
    expect(result.current.filters.assigneeIds).toEqual([]);
  });
});
