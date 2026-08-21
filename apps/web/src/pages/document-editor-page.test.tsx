import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentEditorPage } from "./document-editor-page";
import { SidebarProvider } from "@/components/ui/sidebar";
import { toast } from "sonner";

const mockUseDocument = vi.fn();
const mockUseDeleteDocument = vi.fn();
const mockUseSetDocumentPublic = vi.fn();
const mockWriteText = vi.fn().mockResolvedValue(undefined);

vi.mock("@/hooks/use-documents", () => ({
  useDocument: (...args: any[]) => mockUseDocument(...args),
  useUpdateDocument: () => ({ mutateAsync: vi.fn() }),
  useDeleteDocument: (...args: any[]) => mockUseDeleteDocument(...args),
  useSetDocumentPublic: (...args: any[]) => mockUseSetDocumentPublic(...args),
}));
vi.mock("@/components/markdown", () => ({
  MarkdownEditor: ({ value }: { value: string }) => (
    <div data-testid="markdown">{value}</div>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseDocument.mockImplementation((id: string) => ({
    data: {
      id,
      boardId: "b1",
      taskId: "t1",
      number: 1,
      docNumber: "D-1",
      boardIdentifier: "TF",
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
  }));
  mockUseDeleteDocument.mockImplementation(() => ({ mutate: vi.fn() }));
  mockUseSetDocumentPublic.mockImplementation(() => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  }));
  Object.assign(navigator, { clipboard: { writeText: mockWriteText } });
});

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/board/b1/doc/d1"]}>
        <SidebarProvider>
          <Routes>
            <Route path="/board/:boardId/doc/:docId" element={<DocumentEditorPage />} />
          </Routes>
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

  it("publishes the document and copies the public link", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    mockUseSetDocumentPublic.mockImplementation(() => ({ mutateAsync }));
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: /publish/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      id: "d1",
      boardId: "b1",
      taskId: "t1",
      isPublic: true,
    });
    await waitFor(() =>
      expect(mockWriteText).toHaveBeenCalledWith(
        `${window.location.origin}/public/docs/TF/1`,
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Document published", {
      description: "Public link copied to clipboard",
    });
  });

  it("deletes the document after confirming", async () => {
    const mutate = vi.fn();
    mockUseDeleteDocument.mockImplementation(() => ({ mutate }));
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: /delete document/i }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(mutate).toHaveBeenCalledWith(
      { id: "d1", boardId: "b1", taskId: "t1" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
