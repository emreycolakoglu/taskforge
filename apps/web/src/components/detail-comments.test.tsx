/**
 * Tests for DetailComments delete feature (TFG-8).
 *
 * Tests:
 * - Delete button not shown when onDelete is not provided
 * - Delete button not shown for comments by other users (non-admin)
 * - Delete button shown for user's own comments
 * - Delete button shown for any comment when user is admin
 * - Delete button shown for anonymous comments only to admin
 * - Hover behavior: hidden on desktop, visible on mobile (CSS class check)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DetailComments } from "./detail-comments";
import type { Comment } from "@/types";

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockUser: { id: string; role: string } | null = {
  id: "user-1",
  role: "member",
};

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c1",
    taskId: "t1",
    author: "Alice",
    authorId: "user-1",
    body: "Looks good",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderComments(
  comments: Comment[],
  onDelete?: (id: string) => void,
  user: { id: string; role: string } | null = mockUser,
) {
  mockUser = user;
  return render(
    <DetailComments
      comments={comments}
      onSubmit={vi.fn()}
      onDelete={onDelete}
      formatTimestamp={(ts) => ts}
    />,
  );
}

describe("DetailComments — delete feature (TFG-8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockUser to default (non-admin member)
    mockUser = { id: "user-1", role: "member" };
  });

  it("does not show delete button when onDelete is not provided", () => {
    const comment = makeComment();
    render(
      <DetailComments
        comments={[comment]}
        onSubmit={vi.fn()}
        formatTimestamp={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Comment actions")).not.toBeInTheDocument();
  });

  it("does not show delete button for other user's comments (non-admin)", () => {
    const comment = makeComment({ authorId: "other-user" });
    renderComments([comment], vi.fn());
    expect(screen.queryByLabelText("Comment actions")).not.toBeInTheDocument();
  });

  it("renders delete action for user's own comments", () => {
    const comment = makeComment({ authorId: "user-1" });
    renderComments([comment], vi.fn());
    expect(screen.getByLabelText("Comment actions")).toBeInTheDocument();
  });

  it("renders delete action for any comment when user is admin", () => {
    const comment = makeComment({ authorId: "other-user" });
    renderComments(
      [comment],
      vi.fn(),
      { id: "admin-1", role: "admin" },
    );
    expect(screen.getByLabelText("Comment actions")).toBeInTheDocument();
  });

  it("renders delete action for anonymous (authorId null) comments when admin", () => {
    const comment = makeComment({ authorId: null, author: "system" });
    renderComments(
      [comment],
      vi.fn(),
      { id: "admin-1", role: "admin" },
    );
    expect(screen.getByLabelText("Comment actions")).toBeInTheDocument();
  });

  it("does not render delete action for anonymous comments when non-admin", () => {
    const comment = makeComment({ authorId: null, author: "system" });
    renderComments([comment], vi.fn());
    expect(screen.queryByLabelText("Comment actions")).not.toBeInTheDocument();
  });

  it("delete button has mobile-visible (opacity-100) and desktop-hover (md:opacity-0) classes", () => {
    const comment = makeComment({ authorId: "user-1" });
    renderComments([comment], vi.fn());
    const btn = screen.getByLabelText("Comment actions");
    expect(btn.className).toContain("opacity-100");
    expect(btn.className).toContain("md:opacity-0");
  });
});