/**
 * CreateTaskDialog — project picker (TFG-34).
 *
 * The dialog stays dumb: the board's projects arrive as a prop (same pattern
 * as statuses/users) and the optional projectId prop preselects the picker so
 * the project-detail page's "Add task" affordance can persist a task straight
 * into its project. Picking "No project" sends explicit null so the API's
 * undefined-vs-null distinction holds through the client boundary.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTaskDialog } from './create-task-dialog';
import type { ProjectMeta, Status } from '@/types';
import type { AssigneeOption } from '@/components/detail-assignee-select';

vi.mock('@/components/markdown', () => ({
  MarkdownEditor: () => <div data-testid="markdown-editor" />,
}));

const statuses: Status[] = [
  { id: 's1', boardId: 'b1', name: 'Todo', type: 'todo', position: 0 },
  { id: 's2', boardId: 'b1', name: 'Done', type: 'done', position: 1 },
];

const users: AssigneeOption[] = [
  { id: 'u1', displayName: 'Ada Lovelace' },
  { id: 'u2', displayName: 'Grace Hopper' },
];

const projects: ProjectMeta[] = [
  { id: 'p1', name: 'Roadmap', icon: '📦' },
  { id: 'p2', name: 'Tech debt', icon: null },
];

const noop = () => {};

function renderDialog(overrides?: Partial<Parameters<typeof CreateTaskDialog>[0]>) {
  const onSubmit = vi.fn();
  render(
    <CreateTaskDialog
      open
      onOpenChange={noop}
      statuses={statuses}
      users={users}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onSubmit };
}

describe('CreateTaskDialog — project picker (TFG-34)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the project picker with a No project default', () => {
    renderDialog({ projects });

    expect(screen.getByRole('combobox', { name: 'Project' })).toHaveTextContent('No project');
  });

  it('preselects the project named by the projectId prop', () => {
    renderDialog({ projects, projectId: 'p1' });

    expect(screen.getByRole('combobox', { name: 'Project' })).toHaveTextContent('Roadmap');
  });

  it('carries the picked project into the create payload', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog({ projects });

    await user.type(screen.getByPlaceholderText('Issue title...'), 'New issue');
    await user.click(screen.getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: /roadmap/i }));
    await user.click(screen.getByRole('button', { name: /create issue/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New issue', projectId: 'p1' }),
    );
  });

  it('maps the No project option to explicit null in the payload', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog({ projects, projectId: 'p2' });

    await user.type(screen.getByPlaceholderText('Issue title...'), 'New issue');
    await user.click(screen.getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: /no project/i }));
    await user.click(screen.getByRole('button', { name: /create issue/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New issue', projectId: null }),
    );
  });

  it('persists the projectId prop when the picker is left untouched', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog({ projects, projectId: 'p1' });

    await user.type(screen.getByPlaceholderText('Issue title...'), 'New issue');
    await user.click(screen.getByRole('button', { name: /create issue/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1' }));
  });
});

describe('CreateTaskDialog — board picker mode (Projects v2)', () => {
  const boards = [
    { id: 'b1', name: 'Sprint', icon: '⭐' },
    { id: 'b2', name: 'Infra', icon: null },
  ];

  it('shows no board picker when boards are not passed (board pages)', () => {
    renderDialog({ projects });

    expect(screen.queryByRole('combobox', { name: 'Board' })).toBeNull();
  });

  it('shows the selected board when boards are passed', () => {
    renderDialog({ boards, boardId: 'b2', onBoardChange: vi.fn() });

    expect(screen.getByRole('combobox', { name: 'Board' })).toHaveTextContent('Infra');
  });

  it('reports a board pick to the caller (statuses stay caller-owned)', async () => {
    const user = userEvent.setup();
    const onBoardChange = vi.fn();
    renderDialog({ boards, boardId: 'b1', onBoardChange });

    await user.click(screen.getByRole('combobox', { name: 'Board' }));
    await user.click(await screen.findByRole('option', { name: /infra/i }));

    expect(onBoardChange).toHaveBeenCalledWith('b2');
  });

  it('resets the status to the first of the new statuses when they change', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const otherStatuses: Status[] = [
      { id: 's9', boardId: 'b2', name: 'Backlog', type: 'backlog', position: 0 },
    ];
    const props = {
      open: true,
      onOpenChange: noop,
      users,
      onSubmit,
      boards,
      onBoardChange: vi.fn(),
    };
    const { rerender } = render(<CreateTaskDialog {...props} statuses={statuses} boardId="b1" />);
    await user.type(screen.getByPlaceholderText('Issue title...'), 'Cross-board');
    rerender(<CreateTaskDialog {...props} statuses={otherStatuses} boardId="b2" />);
    await user.click(screen.getByRole('button', { name: /create issue/i }));

    // The typed title survives the board switch; the status follows the board.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Cross-board', statusId: 's9' }),
    );
  });
});

describe('CreateTaskDialog — assignee (shared UserSelect)', () => {
  it('sends the picked assignee', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();
    await user.type(screen.getByPlaceholderText('Issue title...'), 'Assigned');
    await user.click(screen.getByRole('combobox', { name: 'Assignee' }));
    await user.click(await screen.findByRole('option', { name: /grace hopper/i }));
    await user.click(screen.getByRole('button', { name: 'Create issue' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 'u2' }));
  });
});
