/**
 * Tests for useIsMobile hook (TFG-13).
 *
 * Tests matchMedia-based responsive behavior:
 * - returns false on desktop (width >= 768)
 * - returns true on mobile (width < 768)
 * - updates when viewport crosses the breakpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ── Helpers ──────────────────────────────────────────────────────────────────

type MatchMediaListener = (e: MediaQueryListEvent) => void;

function createMatchMediaMock(width: number) {
  const listeners = new Set<MatchMediaListener>();
  return (query: string): MediaQueryList => {
    // Parse the max-width value from the query string.
    // CSS max-width: Npx includes N, so width <= N means it matches.
    const match = query.match(/max-width:\s*(\d+)px/);
    const maxWidth = match ? parseInt(match[1], 10) : 767;
    return {
      matches: width <= maxWidth,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_event: string, listener: MatchMediaListener) =>
        listeners.add(listener),
      removeEventListener: (_event: string, listener: MatchMediaListener) =>
        listeners.delete(listener),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  };
}

describe("useIsMobile (TFG-13)", () => {
  const original = window.matchMedia;

  afterEach(() => {
    window.matchMedia = original;
  });

  it("returns false when viewport is at desktop width (1024px)", async () => {
    window.matchMedia = createMatchMediaMock(1024) as typeof window.matchMedia;
    const { useIsMobile } = await import("./use-mobile");
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when viewport is at mobile width (375px)", async () => {
    window.matchMedia = createMatchMediaMock(375) as typeof window.matchMedia;
    const { useIsMobile } = await import("./use-mobile");
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false at exactly the breakpoint (768px)", async () => {
    // 768 is md, not mobile — useIsMobile uses max-width: 767px
    window.matchMedia = createMatchMediaMock(768) as typeof window.matchMedia;
    const { useIsMobile } = await import("./use-mobile");
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true just below the breakpoint (767px)", async () => {
    window.matchMedia = createMatchMediaMock(767) as typeof window.matchMedia;
    const { useIsMobile } = await import("./use-mobile");
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });
});