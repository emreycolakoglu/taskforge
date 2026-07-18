import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelOptionList } from "./label-option-list";
import type { Label } from "@/types";

const labels = [
  { id: "l1", name: "Bug", color: "#eb5757" },
  { id: "l2", name: "Feature", color: "#5e6ad2" },
] as unknown as Label[];

describe("LabelOptionList", () => {
  it("renders one checkbox per label and reflects selection", () => {
    render(
      <LabelOptionList
        labels={labels}
        isSelected={(id) => id === "l1"}
        onToggle={() => {}}
      />,
    );
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).not.toBeChecked();
  });

  it("toggles the label when its row is clicked", async () => {
    const onToggle = vi.fn();
    render(
      <LabelOptionList
        labels={labels}
        isSelected={() => false}
        onToggle={onToggle}
      />,
    );
    await userEvent.click(screen.getByText("Feature"));
    expect(onToggle).toHaveBeenCalledWith("l2");
  });

  it("disables pending rows", () => {
    render(
      <LabelOptionList
        labels={labels}
        isSelected={() => false}
        onToggle={() => {}}
        isPending={(id) => id === "l1"}
      />,
    );
    expect(screen.getAllByRole("checkbox")[0]).toBeDisabled();
  });

  it("shows empty text when there are no labels", () => {
    render(
      <LabelOptionList
        labels={[]}
        isSelected={() => false}
        onToggle={() => {}}
        emptyText="Nothing here"
      />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});
