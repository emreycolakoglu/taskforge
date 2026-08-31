import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SaveViewDialog } from './save-view-dialog';

const onSubmit = vi.fn();
const onOpenChange = vi.fn();

vi.mock('@/hooks/use-views', () => ({
  useBoardViews: () => ({ data: [] }),
  useCreateView: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteView: () => ({ mutate: vi.fn() }),
  useUpdateView: () => ({ mutate: vi.fn() }),
}));

describe('SaveViewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('shows name input and visibility radios when canShare=true', () => {
    render(
      <SaveViewDialog
        open={true}
        onOpenChange={onOpenChange}
        canShare={true}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText(/personal/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^shared/i)).toBeInTheDocument();
  });

  it('hides the shared option when canShare=false', () => {
    render(
      <SaveViewDialog
        open={true}
        onOpenChange={onOpenChange}
        canShare={false}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByLabelText(/^shared/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/personal/i)).toBeInTheDocument();
  });

  it('submits with the typed name and shared flag', () => {
    render(
      <SaveViewDialog
        open={true}
        onOpenChange={onOpenChange}
        canShare={true}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My view' } });
    fireEvent.click(screen.getByLabelText(/^shared/i));
    fireEvent.click(screen.getByRole('button', { name: /save view/i }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'My view', shared: true });
  });

  it('submits shared=false when personal is selected (default)', () => {
    render(
      <SaveViewDialog
        open={true}
        onOpenChange={onOpenChange}
        canShare={true}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Solo' } });
    fireEvent.click(screen.getByRole('button', { name: /save view/i }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Solo', shared: false });
  });

  it('does not submit an empty name', () => {
    render(
      <SaveViewDialog
        open={true}
        onOpenChange={onOpenChange}
        canShare={true}
        onSubmit={onSubmit}
      />,
    );

    const saveButton = screen.getByRole('button', { name: /save view/i });
    expect(saveButton).toBeDisabled();

    fireEvent.click(saveButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
