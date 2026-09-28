/**
 * DetailPropertiesSidebar — "Set parent" (TFG-58).
 *
 * The sidebar renders a Set parent row: shows the current parent (navigable)
 * and a DetailAddParentPopover to set / change / clear the parent via
 * onUpdate({ parentId }).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DetailPropertiesSidebar } from './detail-properties-sidebar';
import type { Task } from '@/types';

const mockTaskPickerPopover = vi.hoisted(() => vi.fn());

vi.mock('./task-picker-popover', () => ({
  TaskPickerPopover: (props: unknown) => {
    mockTaskPickerPopover(props);
    return null;
  },
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    statusId: 'status-1',
    boardId: 'board-1',
    number: 1,
    taskNumber: 'TFG-1',
    title: 'Test task',
    priority: 'medium',
    position: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  } as Task;
}

const noop = () => {};
const formatTimestamp = () => '';

function renderSidebar(task: Task, boardTasks: Task[] = [], onUpdate = noop) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DetailPropertiesSidebar
        task={task}
        board={undefined}
        users={[]}
        boardTasks={boardTasks}
        relations={undefined}
        onUpdate={onUpdate}
        onAddRelation={noop}
        onRemoveRelation={noop}
        onNavigate={noop}
        onScrollTo={noop}
        formatTimestamp={formatTimestamp}
      />
    </QueryClientProvider>,
  );
}

describe('DetailPropertiesSidebar — Set parent (TFG-58)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setParentProps() {
    const calls = mockTaskPickerPopover.mock.calls as Array<
      [
        {
          triggerLabel?: string;
          tasks?: Task[];
          onSelect?: (id: string) => void;
        } & Record<string, unknown>,
      ]
    >;
    const call = calls.find(([p]) => p.triggerLabel === 'Set parent');
    return call?.[0] as { tasks: Task[]; onSelect: (id: string) => void; triggerLabel: string };
  }

  it('renders the Set parent picker in the Properties group', () => {
    renderSidebar(makeTask());

    const props = setParentProps();
    expect(props).toBeDefined();
    expect(props.triggerLabel).toBe('Set parent');
  });

  it('excludes self, tasks with a parent, and own sub-tasks from the picker', () => {
    const boardTasks: Task[] = [
      makeTask({ id: 'task-1', taskNumber: 'TFG-1' }),
      makeTask({ id: 'task-2', taskNumber: 'TFG-2', title: 'Candidate' }),
      makeTask({ id: 'task-3', taskNumber: 'TFG-3', title: 'Has parent', parentId: 'task-9' }),
      makeTask({ id: 'task-4', taskNumber: 'TFG-4', title: 'Own child', parentId: 'task-1' }),
    ];
    const subTasks: Task[] = [makeTask({ id: 'task-4', title: 'Own child' })];
    renderSidebar(makeTask({ subTasks }), boardTasks);

    const props = setParentProps();
    expect(props.tasks.map((t) => t.id)).toEqual(['task-2']);
  });

  it('calls onUpdate({ parentId }) when a parent is picked', () => {
    const boardTasks: Task[] = [makeTask({ id: 'task-2', taskNumber: 'TFG-2', title: 'Papa' })];
    const onUpdate = vi.fn();
    renderSidebar(makeTask(), boardTasks, onUpdate);

    const props = setParentProps();
    props.onSelect('task-2');

    expect(onUpdate).toHaveBeenCalledWith({ parentId: 'task-2' });
  });

  it('shows the current parent with a remove control, and un-nests via onUpdate({ parentId: null })', () => {
    const onUpdate = vi.fn();
    renderSidebar(
      makeTask({
        parent: { id: 'task-2', number: 2, title: 'Papa', board: { identifier: 'TFG' } },
      } as Partial<Task>),
      [],
      onUpdate,
    );

    expect(screen.getByText('TFG-2')).toBeInTheDocument();
    // The "Set parent" picker is replaced by the parent reference + unlink.
    expect(setParentProps()).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: /unlink parent/i }));
    expect(onUpdate).toHaveBeenCalledWith({ parentId: null });
  });
});
