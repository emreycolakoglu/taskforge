import { describe, it, expect, vi } from 'vitest';
import { render, waitFor, fireEvent } from '@testing-library/react';
import MarkdownEditor from './markdown-editor';

const directory = [{ id: 'u1', displayName: 'emre' }];

/**
 * Mounts the real TipTap editor (not the lazy wrapper) so the mention
 * hydration path — parse → updateDOM → chip — is exercised end to end.
 */
describe('MarkdownEditor mention chips', () => {
  it('renders a known @Name as a chip when mentions are available at creation', async () => {
    render(<MarkdownEditor value="ping @emre!" mentions={directory} editable={false} />);

    await waitFor(() => {
      expect(document.querySelector('span.mention')).not.toBeNull();
    });
    const chip = document.querySelector('span.mention')!;
    expect(chip.textContent).toBe('@emre');
  });

  it('hydrates chips when the mention directory arrives after mount', async () => {
    const { rerender } = render(<MarkdownEditor value="ping @emre!" editable={false} />);

    await waitFor(() => {
      expect(document.querySelector('.tiptap')).not.toBeNull();
    });
    expect(document.querySelector('span.mention')).toBeNull();

    // The directory arrives async (React Query) after the editor mounts. The
    // editor must be recreated so the parse hook re-runs with the mentions.
    rerender(<MarkdownEditor value="ping @emre!" mentions={directory} editable={false} />);

    await waitFor(() => {
      expect(document.querySelector('span.mention')).not.toBeNull();
    });
  });

  it('calls onMentionClick with the user id when a chip is clicked', async () => {
    const onMentionClick = vi.fn();
    render(
      <MarkdownEditor
        value="ping @emre!"
        mentions={directory}
        editable={false}
        onMentionClick={onMentionClick}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector('span.mention')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('span.mention')!);
    expect(onMentionClick).toHaveBeenCalledWith('u1');
  });
});
