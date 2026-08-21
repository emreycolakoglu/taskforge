import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DetailDocuments } from "./detail-documents";

const mockDocs = [
  {
    id: "d1",
    title: "Spec",
    docNumber: "D-1",
    taskNumber: "TF-1",
    isPublic: false,
    updatedAt: "2026-01-01",
  },
];

// Module-level mock fn so per-test overrides work (same pattern as use-tasks.test.tsx).
const mockUseDocumentsByTask = vi.fn((..._args: any[]) => ({ data: mockDocs }));

vi.mock("@/hooks/use-documents", () => ({
  useDocumentsByTask: (...args: any[]) => mockUseDocumentsByTask(...args),
  useCreateDocument: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseDocumentsByTask.mockImplementation(() => ({ data: mockDocs }));
});

function renderDocs() {
  return render(
    <MemoryRouter>
      <DetailDocuments taskId="t1" boardId="b1" />
    </MemoryRouter>,
  );
}

describe("DetailDocuments", () => {
  it("lists documents with D-number and title", () => {
    renderDocs();
    expect(screen.getByText("Spec")).toBeInTheDocument();
    expect(screen.getByText("D-1")).toBeInTheDocument();
  });

  it("shows an empty state", () => {
    mockUseDocumentsByTask.mockImplementation(() => ({ data: [] }));
    renderDocs();
    expect(screen.getByText(/no documents/i)).toBeInTheDocument();
  });
});
