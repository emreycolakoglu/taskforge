import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentEditorPage } from "./document-editor-page";
import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("@/hooks/use-documents", () => ({
  useDocument: (id: string) => ({
    data: {
      id,
      boardId: "b1",
      taskId: "t1",
      number: 1,
      docNumber: "D-1",
      taskNumber: "TF-1",
      taskTitle: "Host",
      title: "My doc",
      body: "",
      isPublic: false,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    isLoading: false,
    error: null,
  }),
  useUpdateDocument: () => ({ mutateAsync: vi.fn() }),
  useDeleteDocument: () => ({ mutate: vi.fn() }),
  useSetDocumentPublic: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/components/markdown", () => ({
  MarkdownEditor: ({ value }: { value: string }) => (
    <div data-testid="markdown">{value}</div>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/board/b1/doc/d1"]}>
        <SidebarProvider>
          <DocumentEditorPage />
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DocumentEditorPage", () => {
  it("renders the doc number and back link", () => {
    renderPage();
    expect(screen.getByText("D-1")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to task/i }),
    ).toBeInTheDocument();
  });
});
