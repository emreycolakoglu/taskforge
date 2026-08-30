import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmojiPicker } from './emoji-picker';

/**
 * TFG-43: the Tech category listed 🛠️ twice, so the grid keyed by emoji
 * had duplicate React keys — swapping tabs then rendered a corrupted grid
 * (leftover cells from the previous category). These tests pin the
 * invariants: rendered cells always match the active category data,
 * with no duplicates, across tab swaps.
 */

const gridEmojis = () =>
  Array.from(document.querySelectorAll('[data-slot=popover-content] .grid button')).map(
    (b) => b.textContent,
  );

describe('EmojiPicker', () => {
  it('opens on trigger click and selects an emoji', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<EmojiPicker value="⭐" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /select emoji/i }));
    await user.click(await screen.findByText('Objects'));
    await user.click(await screen.findByText('🔥'));

    expect(onChange).toHaveBeenCalledWith('🔥');
  });

  it('renders each category cell without duplicates', async () => {
    const user = userEvent.setup();
    render(<EmojiPicker value="⭐" onChange={() => {}} />);

    await user.click(screen.getByRole('button', { name: /select emoji/i }));
    await user.click(await screen.findByText('Smileys'));

    const emojis = gridEmojis();
    expect(emojis.length).toBeGreaterThan(0);
    expect(new Set(emojis).size).toBe(emojis.length);
  });

  it('renders the full category after swapping tabs back and forth (TFG-43)', async () => {
    const user = userEvent.setup();
    render(<EmojiPicker value="⭐" onChange={() => {}} />);

    await user.click(screen.getByRole('button', { name: /select emoji/i }));

    await user.click(await screen.findByText('Tech'));
    await user.click(await screen.findByText('Symbols'));
    await user.click(await screen.findByText('Tech'));

    const emojis = gridEmojis();
    expect(emojis[0]).toBe('💻');
    expect(new Set(emojis).size).toBe(emojis.length);
  });
});
