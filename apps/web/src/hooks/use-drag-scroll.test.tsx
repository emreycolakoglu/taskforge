import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useDragScroll } from './use-drag-scroll';

const onCardClick = vi.fn();
const onBackgroundClick = vi.fn();

function Harness() {
  const { ref, isDragging } = useDragScroll<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="scroller" className={isDragging ? 'cursor-grabbing' : ''}>
      <div data-testid="background" onClick={onBackgroundClick}>
        <div data-testid="card" data-rfd-drag-handle-draggable-id="t1" onClick={onCardClick}>
          card
        </div>
      </div>
    </div>
  );
}

/**
 * jsdom does no layout, so scrollLeft is a hard-coded 0 on the prototype.
 * Shadow it with a plain writable property so the hook's writes are observable.
 */
function renderScroller() {
  render(<Harness />);
  const scroller = screen.getByTestId('scroller');
  Object.defineProperty(scroller, 'scrollLeft', { value: 0, writable: true, configurable: true });
  return scroller;
}

beforeEach(() => {
  onCardClick.mockClear();
  onBackgroundClick.mockClear();
});

describe('useDragScroll', () => {
  it('pans the container by the inverse of the horizontal mouse delta', () => {
    const scroller = renderScroller();
    scroller.scrollLeft = 100;

    fireEvent.mouseDown(screen.getByTestId('background'), { button: 0, clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 380 });

    expect(scroller.scrollLeft).toBe(220);

    fireEvent.mouseMove(window, { clientX: 600 });
    expect(scroller.scrollLeft).toBe(0);
  });

  it('flags dragging only while a pan is in progress', () => {
    const scroller = renderScroller();

    fireEvent.mouseDown(screen.getByTestId('background'), { button: 0, clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 480 });
    expect(scroller.className).toContain('cursor-grabbing');

    fireEvent.mouseUp(window);
    expect(scroller.className).not.toContain('cursor-grabbing');
  });

  it('ignores mousedown on a dnd drag handle so cards stay draggable', () => {
    const scroller = renderScroller();
    scroller.scrollLeft = 100;

    fireEvent.mouseDown(screen.getByTestId('card'), { button: 0, clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 300 });

    expect(scroller.scrollLeft).toBe(100);
  });

  it('ignores non-primary buttons', () => {
    const scroller = renderScroller();
    scroller.scrollLeft = 100;

    fireEvent.mouseDown(screen.getByTestId('background'), { button: 2, clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 300 });

    expect(scroller.scrollLeft).toBe(100);
  });

  it('leaves movement under the threshold alone and lets the click through', () => {
    const scroller = renderScroller();
    scroller.scrollLeft = 100;

    fireEvent.mouseDown(screen.getByTestId('background'), { button: 0, clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 502 });
    fireEvent.mouseUp(window);
    fireEvent.click(screen.getByTestId('card'));

    expect(scroller.scrollLeft).toBe(100);
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it('swallows the click that follows a pan, but only that one', () => {
    renderScroller();

    fireEvent.mouseDown(screen.getByTestId('background'), { button: 0, clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 300 });
    fireEvent.mouseUp(window);
    fireEvent.click(screen.getByTestId('card'));

    expect(onCardClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('card'));
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it('drops a stale click suppressor when the next press starts', () => {
    renderScroller();

    // Pan, then release outside the window: no click follows, so the suppressor
    // is still armed when the user presses again.
    fireEvent.mouseDown(screen.getByTestId('background'), { button: 0, clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 300 });
    fireEvent.mouseUp(window);

    fireEvent.mouseDown(screen.getByTestId('card'), { button: 0, clientX: 300 });
    fireEvent.mouseUp(window);
    fireEvent.click(screen.getByTestId('card'));

    expect(onCardClick).toHaveBeenCalledTimes(1);
  });
});
