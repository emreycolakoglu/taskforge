/**
 * Tests for useCreateTask optimistic update behavior (TFG-9).
 *
 * Tests the onMutate/onError/onSuccess lifecycle:
 * - onMutate: adds optimistic task to cache with isOptimistic flag
 * - onError: rolls back to previous state
 * - onSuccess: replaces optimistic placeholder with real task
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Task } from "@/types";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockCreateTask = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("@/hooks/api", () => ({
  api: {
    tasks: {
      create: (...args: any[]) => mockCreateTask(...args),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    ),
  };
}

const BOARD_ID = "board-1";
const STATUS_ID = "status-1";

function seedTasks(queryClient: QueryClient, tasks: Task[]) {
  queryClient.setQueryData(["tasks", "board", BOARD_ID], tasks);
}

describe("useCreateTask — optimistic rendering (TFG-9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds an optimistic task to the cache on mutate", async () => {
    const { queryClient, wrapper } = createWrapper();
    seedTasks(queryClient, []);

    // Simulate API delay so we can observe the optimistic state
    let resolveApi: (value: Task) => void = () => {};
    mockCreateTask.mockReturnValueOnce(
      new Promise<Task>((resolve) => {
        resolveApi = resolve;
      }),
    );

    const { useCreateTask } = await import("./use-tasks");
    const { result } = renderHook(() => useCreateTask(), { wrapper });

    result.current.mutate({
      statusId: STATUS_ID,
      title: "New Task",
      boardId: BOARD_ID,
    });

    // Optimistic task should appear immediately
    await waitFor(() => {
      const cached = queryClient.getQueryData<Task[]>(["tasks", "board", BOARD_ID]);
      expect(cached).toHaveLength(1);
      expect(cached![0].isOptimistic).toBe(true);
      expect(cached![0].title).toBe("New Task");
    });
  });

  it("replaces optimistic task with real task on success", async () => {
    const { queryClient, wrapper } = createWrapper();
    seedTasks(queryClient, []);

    const realTask: Task = {
      id: "real-1",
      statusId: STATUS_ID,
      boardId: BOARD_ID,
      number: 1,
      taskNumber: "TFG-1",
      title: "New Task",
      description: null,
      position: 0,
      priority: "medium",
      doneAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };

    mockCreateTask.mockResolvedValueOnce(realTask);

    const { useCreateTask } = await import("./use-tasks");
    const { result } = renderHook(() => useCreateTask(), { wrapper });

    result.current.mutate({
      statusId: STATUS_ID,
      title: "New Task",
      boardId: BOARD_ID,
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Task[]>(["tasks", "board", BOARD_ID]);
      expect(cached).toHaveLength(1);
      expect(cached![0].id).toBe("real-1");
      expect(cached![0].taskNumber).toBe("TFG-1");
      expect(cached![0].isOptimistic).toBe(false);
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("Task created");
  });

  it("rolls back optimistic task on error and shows toast", async () => {
    const { queryClient, wrapper } = createWrapper();
    const existingTask: Task = {
      id: "existing-1",
      statusId: STATUS_ID,
      boardId: BOARD_ID,
      number: 1,
      taskNumber: "TFG-1",
      title: "Existing",
      description: null,
      position: 0,
      priority: "medium",
      doneAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    seedTasks(queryClient, [existingTask]);

    mockCreateTask.mockRejectedValueOnce(new Error("Network error"));

    const { useCreateTask } = await import("./use-tasks");
    const { result } = renderHook(() => useCreateTask(), { wrapper });

    result.current.mutate({
      statusId: STATUS_ID,
      title: "Failed Task",
      boardId: BOARD_ID,
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<Task[]>(["tasks", "board", BOARD_ID]);
      // Should be back to only the existing task
      expect(cached).toHaveLength(1);
      expect(cached![0].id).toBe("existing-1");
      expect(cached!.some((t) => t.isOptimistic)).toBe(false);
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "Failed to create task",
      { description: "Network error" },
    );
  });

  it("cancels existing queries to prevent race conditions", async () => {
    const { queryClient, wrapper } = createWrapper();
    seedTasks(queryClient, []);

    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");

    let resolveApi: (value: Task) => void = () => {};
    mockCreateTask.mockReturnValueOnce(
      new Promise<Task>((resolve) => {
        resolveApi = resolve;
      }),
    );

    const { useCreateTask } = await import("./use-tasks");
    const { result } = renderHook(() => useCreateTask(), { wrapper });

    result.current.mutate({
      statusId: STATUS_ID,
      title: "New Task",
      boardId: BOARD_ID,
    });

    await waitFor(() => {
      expect(cancelSpy).toHaveBeenCalledWith({
        queryKey: ["tasks", "board", BOARD_ID],
      });
    });
  });
});