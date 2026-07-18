import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskPickerPopover } from "./task-picker-popover";
import type { Task } from "@/types";

const tasks = [
  { id: "t1", taskNumber: "TF-1", title: "Fix login" },
  { id: "t2", taskNumber: "TF-2", title: "Add dashboard" },
] as unknown as Task[];

describe("TaskPickerPopover", () => {
  it("opens on trigger click and selects a task by id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <TaskPickerPopover
        tasks={tasks}
        onSelect={onSelect}
        triggerLabel="Set parent"
      />,
    );

    await user.click(screen.getByRole("button", { name: /set parent/i }));
    await user.click(await screen.findByText("Add dashboard"));

    expect(onSelect).toHaveBeenCalledWith("t2");
  });
});
