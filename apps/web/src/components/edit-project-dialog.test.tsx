/**
 * EditProjectDialog — prefill, diffed save payload (cleared fields go out as
 * explicit null so the API clears them instead of ignoring them), status and
 * lead changes, close-on-success, and the confirmed delete action.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Project } from '@/types';
import { EditProjectDialog } from './edit-project-dialog';

const updateMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock('@/hooks/use-projects', () => ({
  useUpdateProject: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteProject: () => ({ mutate: deleteMutate, isPending: false }),
}));
vi.mock('@/hooks/use-users', () => ({
  useUserDirectory: () => ({
    data: [
      { id: 'u1', displayName: 'Alice' },
      { id: 'u2', displayName: 'Bob' },
    ],
  }),
}));

const project: Project = {
  id: 'p1',
  name: 'Roadmap',
  description: 'Q3 planning',
  icon: '🚀',
  leadId: 'u1',
  status: 'started',
  completedAt: null,
  startDate: '2026-07-01T00:00:00.000Z',
  targetDate: '2026-09-30T00:00:00.000Z',
  position: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

function renderDialog(overrides: Partial<Project> = {}) {
  const onOpenChange = vi.fn();
  const onDeleted = vi.fn();
  render(
    <EditProjectDialog
      project={{ ...project, ...overrides }}
      open
      onOpenChange={onOpenChange}
      onDeleted={onDeleted}
    />,
  );
  return { onOpenChange, onDeleted };
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

describe('EditProjectDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills every field from the project', () => {
    renderDialog();
    expect(screen.getByRole('heading', { name: 'Edit project' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Roadmap');
    expect(screen.getByLabelText('Description')).toHaveValue('Q3 planning');
    expect(screen.getByRole('button', { name: 'Select emoji' })).toHaveTextContent('🚀');
    expect(screen.getByLabelText('Status')).toHaveValue('started');
    expect(screen.getByRole('combobox', { name: 'Lead' })).toHaveTextContent('Alice');
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-07-01');
    expect(screen.getByLabelText('Target date')).toHaveValue('2026-09-30');
  });

  it('sends only the changed fields', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Roadmap v2');
    await save();
    expect(updateMutate).toHaveBeenCalledWith(
      { id: 'p1', data: { name: 'Roadmap v2' } },
      expect.anything(),
    );
  });

  it('does not revert a concurrent change that arrives while the dialog is open', async () => {
    const user = userEvent.setup();
    const props = { open: true, onOpenChange: vi.fn() };
    const { rerender } = render(<EditProjectDialog project={project} {...props} />);
    // Someone else completes the project; the socket refetch re-renders us.
    rerender(<EditProjectDialog project={{ ...project, status: 'completed' }} {...props} />);
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Roadmap v2');
    await save();
    expect(updateMutate).toHaveBeenCalledWith(
      { id: 'p1', data: { name: 'Roadmap v2' } },
      expect.anything(),
    );
  });

  it('changes the status', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.selectOptions(screen.getByLabelText('Status'), 'completed');
    await save();
    expect(updateMutate).toHaveBeenCalledWith(
      { id: 'p1', data: { status: 'completed' } },
      expect.anything(),
    );
  });

  it('picks a different lead', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: 'Lead' }));
    await user.click(await screen.findByRole('option', { name: /bob/i }));
    await save();
    expect(updateMutate).toHaveBeenCalledWith(
      { id: 'p1', data: { leadId: 'u2' } },
      expect.anything(),
    );
  });

  it('sends explicit null for a cleared lead, dates and description', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: 'Lead' }));
    await user.click(await screen.findByRole('option', { name: /no lead/i }));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '' } });
    await user.clear(screen.getByLabelText('Description'));
    await save();
    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: 'p1',
        data: { leadId: null, startDate: null, targetDate: null, description: null },
      },
      expect.anything(),
    );
  });

  it('sets a date on a project that had none', async () => {
    renderDialog({ targetDate: null });
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2026-12-01' } });
    await save();
    expect(updateMutate).toHaveBeenCalledWith(
      { id: 'p1', data: { targetDate: '2026-12-01' } },
      expect.anything(),
    );
  });

  it('closes on a successful save', async () => {
    updateMutate.mockImplementation((_vars, opts) => opts.onSuccess());
    const { onOpenChange } = renderDialog();
    await userEvent.type(screen.getByLabelText('Name'), '!');
    await save();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes without a request when nothing changed', async () => {
    const { onOpenChange } = renderDialog();
    await save();
    expect(updateMutate).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables Save while the name is empty', async () => {
    renderDialog();
    await userEvent.clear(screen.getByLabelText('Name'));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('has exactly one primary (Lime) action — Save', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    const primaries = dialog.querySelectorAll('button.bg-primary');
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent('Save changes');
  });

  it('deletes the project only after confirming, then reports it', async () => {
    deleteMutate.mockImplementation((_id, opts) => opts.onSuccess());
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    // Stateful parent: the confirm replaces the edit dialog, so `open` must
    // really flip to false for the hand-off to happen.
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <EditProjectDialog
          project={project}
          open={open}
          onOpenChange={setOpen}
          onDeleted={onDeleted}
        />
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Delete project' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deleteMutate).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(deleteMutate).toHaveBeenCalledWith('p1', expect.anything());
    expect(onDeleted).toHaveBeenCalled();
  });

  it('cancelling the delete confirm deletes nothing', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(true);
      return <EditProjectDialog project={project} open={open} onOpenChange={setOpen} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Delete project' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
