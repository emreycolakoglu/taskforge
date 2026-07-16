import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailBreadcrumbBar } from "./detail-breadcrumb-bar";

const writeText = vi.fn().mockResolvedValue(undefined);

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderBar(overrides: Partial<Parameters<typeof DetailBreadcrumbBar>[0]> = {}) {
  const onSetPublic = vi.fn().mockResolvedValue(undefined);
  render(
    <DetailBreadcrumbBar
      boardName="TaskForge"
      statusName="In Progress"
      taskNumber="TF-123"
      taskId="task-1"
      boardId="board-1"
      isPublic={false}
      position={{ current: 1, total: 3 }}
      onBack={vi.fn()}
      onNavigateTask={vi.fn()}
      onSetPublic={onSetPublic}
      {...overrides}
    />,
  );
  return { onSetPublic };
}

async function openActionsMenu() {
  await userEvent.click(screen.getByRole("button", { name: "Task actions" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText } });
});

describe("DetailBreadcrumbBar — public sharing", () => {
  it("does not show the Public badge for a private task", () => {
    renderBar({ isPublic: false });
    expect(screen.queryByText("Public")).not.toBeInTheDocument();
  });

  it("shows the Public badge for a published task", () => {
    renderBar({ isPublic: true });
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("offers Make public for a private task", async () => {
    renderBar({ isPublic: false });
    await openActionsMenu();
    expect(screen.getByText("Make public")).toBeInTheDocument();
    expect(screen.queryByText("Make private")).not.toBeInTheDocument();
    expect(screen.queryByText("Copy public link")).not.toBeInTheDocument();
  });

  it("offers Make private and Copy public link for a published task", async () => {
    renderBar({ isPublic: true });
    await openActionsMenu();
    expect(screen.getByText("Make private")).toBeInTheDocument();
    expect(screen.getByText("Copy public link")).toBeInTheDocument();
    expect(screen.queryByText("Make public")).not.toBeInTheDocument();
  });

  it("publishes and copies the public URL in one click", async () => {
    const { onSetPublic } = renderBar({ isPublic: false });
    await openActionsMenu();
    await userEvent.click(screen.getByText("Make public"));

    expect(onSetPublic).toHaveBeenCalledWith(true);
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/public/TF/123`,
      ),
    );
  });

  it("unpublishes without copying anything", async () => {
    const { onSetPublic } = renderBar({ isPublic: true });
    await openActionsMenu();
    await userEvent.click(screen.getByText("Make private"));

    expect(onSetPublic).toHaveBeenCalledWith(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the public URL derived from the task number, not the current page URL", async () => {
    renderBar({ isPublic: true, taskNumber: "ABC-7" });
    await openActionsMenu();
    await userEvent.click(screen.getByText("Copy public link"));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/public/ABC/7`,
      ),
    );
  });
});
