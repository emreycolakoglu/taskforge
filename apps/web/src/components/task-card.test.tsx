import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Task } from '@/types';
import { TaskCard } from './task-card';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    statusId: 's1',
    boardId: 'b1',
    number: 1,
    taskNumber: 'TF-1',
    title: 'Test task',
    position: 0,
    priority: 'medium',
    doneAt: null,
    assigneeId: null,
    parentId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    _count: { comments: 0 },
    ...overrides,
  };
}

describe('TaskCard', () => {
  it('shows a read-only estimate chip when an estimate is set', () => {
    render(<TaskCard task={makeTask({ estimate: 3 })} />);
    expect(screen.getByText('3 pts')).toBeInTheDocument();
  });

  it('hides the estimate chip when none is set', () => {
    render(<TaskCard task={makeTask({ estimate: null })} />);
    expect(screen.queryByText('pts')).not.toBeInTheDocument();
  });
});
