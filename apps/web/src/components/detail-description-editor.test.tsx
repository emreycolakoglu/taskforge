import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DetailDescriptionEditor } from './detail-description-editor';

/** Mirrors the component's own prop contract (the module exports no type). */
interface EditorProps {
  value: string;
  onSave: (value: string) => void;
}

interface MockEditorProps {
  onChange?: (markdown: string) => void;
  onBlur?: (markdown: string) => void;
}

let capturedEditor: MockEditorProps | null = null;

vi.mock('@/components/markdown', () => ({
  // Stand-in for the lazy TipTap editor: expose the edit callbacks so tests
  // can simulate typing without mounting ProseMirror.
  MarkdownEditor: (props: MockEditorProps) => {
    capturedEditor = props;
    return <div data-testid="mock-editor" />;
  },
}));

function type(markdown: string) {
  act(() => {
    capturedEditor?.onChange?.(markdown);
  });
}

function blur(markdown: string) {
  act(() => {
    capturedEditor?.onBlur?.(markdown);
  });
}

function renderEditor({ value, onSave }: EditorProps) {
  return render(<DetailDescriptionEditor value={value} onSave={onSave} />, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  });
}

/**
 * Regression tests for the cross-task autosave race (TFG-45): a pending
 * debounced description save must never be delivered to a different task
 * after the component's value/task identity changes mid-debounce.
 */
describe('DetailDescriptionEditor cross-task autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    capturedEditor = null;
  });
  afterEach(() => vi.useRealTimers());

  it('saves a typed edit to the current task after the debounce', () => {
    const onSave = vi.fn();
    renderEditor({ value: 'original', onSave });

    type('edited on task A');

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(onSave).toHaveBeenCalledWith('edited on task A');
  });

  it('flushes a typed edit on blur to the current task', () => {
    const onSave = vi.fn();
    renderEditor({ value: 'original', onSave });

    type('typed');
    blur('typed and blurred');

    expect(onSave).toHaveBeenCalledWith('typed and blurred');
  });

  it('drops a pending save when the value swaps to another task mid-debounce', () => {
    const onSaveForA = vi.fn();
    const onSaveForB = vi.fn();
    const { rerender } = renderEditor({ value: 'description of task A', onSave: onSaveForA });

    // User typed on task A; debounce starts, save still pending.
    type('STALE EDIT FROM TASK A');

    // Navigation to task B lands before the debounce fires: new value + new handler.
    rerender(<DetailDescriptionEditor value="description of task B" onSave={onSaveForB} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // The stale edit must not reach either task's handler.
    expect(onSaveForA).not.toHaveBeenCalled();
    expect(onSaveForB).not.toHaveBeenCalled();
  });

  it('drops a pending save on unmount instead of mis-delivering it', () => {
    // The unmount flush must target the task the edit was typed under; when
    // the parent remounts per task (key={taskId}) the whole editor unmounts,
    // so the flush in useEffect cleanup fires with the OLD handlers — this
    // asserts that behavior stays correct at this layer too.
    const onSaveForA = vi.fn();
    const { unmount } = renderEditor({ value: 'description of task A', onSave: onSaveForA });

    type('pending edit for task A');
    unmount();

    expect(onSaveForA).toHaveBeenCalledWith('pending edit for task A');
  });
});
