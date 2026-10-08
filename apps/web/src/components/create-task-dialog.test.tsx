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
