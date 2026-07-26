import { useCallback, useEffect, useState } from 'react'

/**
 * useDragScroll — Linear-style click-and-drag horizontal panning.
 *
 * Returns a callback ref to put on a horizontally scrollable container and an
 * `isDragging` flag for cursor/selection styling. Grab any empty space in the
 * container and drag sideways to scroll it.
 *
 * Coexisting with @hello-pangea/dnd matters here: a pan must never start on a
 * card, or the card would move and the board would pan at the same time. Any
 * mousedown landing on a drag handle (or an ordinary interactive element) is
 * therefore ignored outright.
 *
 * Mouse events, not pointer events — a touch drag never produces a mousemove
 * sequence, so touch keeps its native inertial scrolling for free.
 */

/** Elements that own their mousedown; a pan must not start on any of them. */
const NON_PANNABLE_SELECTOR = [
  '[data-rfd-drag-handle-draggable-id]',
  'a',
  'button',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[contenteditable="true"]',
].join(',')

/** Movement below this is a click, not a pan — keeps plain clicks working. */
const DRAG_THRESHOLD_PX = 4

export function useDragScroll<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // A callback ref rather than useRef: the container mounts later than the hook
  // (the board renders nothing until it has data, and the list view unmounts it
  // entirely), so the effect has to re-run when the element appears.
  const ref = useCallback((node: T | null) => setElement(node), [])

  useEffect(() => {
    if (!element) return

    let startX = 0
    let startScrollLeft = 0
    let armed = false
    let panning = false

    // A pan ends on mouseup, which the browser follows with a click on the
    // common ancestor of the press and release — that would open whichever card
    // the cursor happened to land on. Swallow exactly that one click.
    const suppressClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const stopSuppressingClick = () =>
      element.removeEventListener('click', suppressClick, true)

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startX
      if (!panning) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return
        panning = true
        setIsDragging(true)
      }
      element.scrollLeft = startScrollLeft - dx
      e.preventDefault()
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      armed = false
      if (panning) {
        panning = false
        setIsDragging(false)
        element.addEventListener('click', suppressClick, { capture: true, once: true })
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      // A stale suppressor survives when mouseup fired outside the window and no
      // click followed; drop it so it can't eat an unrelated click later.
      stopSuppressingClick()
      if (e.button !== 0 || armed) return
      const target = e.target as HTMLElement | null
      if (!target || target.closest(NON_PANNABLE_SELECTOR)) return

      armed = true
      startX = e.clientX
      startScrollLeft = element.scrollLeft
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }

    element.addEventListener('mousedown', onMouseDown)
    return () => {
      element.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      stopSuppressingClick()
    }
  }, [element])

  return { ref, isDragging }
}
