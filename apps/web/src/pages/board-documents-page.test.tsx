import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BoardDocumentsPage } from "./board-documents-page";

vi.mock("@/hooks/use-documents", () => ({
  useDocumentsByBoard: () => ({
    data: [
      {
        id: "d1",
        title: "Spec",
        docNumber: "D-1",
        taskNumber: "TF-12",
        isPublic: true,
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
  }),
  useCreateDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-boards", () => ({
  useBoardFull: () => ({
    data: { id: "b1", name: "Sprint 1", identifier: "TF", statuses: [] },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/board/b1/docs"]}>
        <BoardDocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("BoardDocumentsPage", () => {
  it("renders document rows with title and doc number", () => {
    renderPage();
    expect(screen.getByText("Spec")).toBeInTheDocument();
    expect(screen.getByText("D-1")).toBeInTheDocument();
    expect(screen.getByText("TF-12")).toBeInTheDocument();
  });

  it("shows the published indicator", () => {
    renderPage();
    expect(screen.getByText("published")).toBeInTheDocument();
  });
});
