import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("fires onCheckedChange when clicked", async () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox checked={false} onCheckedChange={onCheckedChange} aria-label="pick" />,
    );
    await userEvent.click(screen.getByRole("checkbox"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("reflects the checked prop for assistive tech", () => {
    render(<Checkbox checked aria-label="on" />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("uses a lime-free checked treatment per design.md accent rationing", () => {
    render(<Checkbox checked aria-label="on" />);
    const cls = screen.getByRole("checkbox").className;
    expect(cls).not.toContain("bg-primary");
    expect(cls).toContain("data-[state=checked]:bg-foreground");
  });
});
