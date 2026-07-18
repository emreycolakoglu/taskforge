import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DetailAssigneeSelect } from "./detail-assignee-select";
import type { User } from "@/types";

const users = [
  { id: "u1", displayName: "Ada Lovelace" },
  { id: "u2", displayName: "Alan Turing" },
] as unknown as User[];

describe("DetailAssigneeSelect", () => {
  it("shows the selected user in the trigger", () => {
    render(
      <DetailAssigneeSelect value="u1" users={users} onChange={() => {}} />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Ada Lovelace");
  });

  it("maps the Unassigned option back to null", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DetailAssigneeSelect value="u1" users={users} onChange={onChange} />,
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /unassigned/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("passes a picked user id through unchanged", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DetailAssigneeSelect value={null} users={users} onChange={onChange} />,
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /alan turing/i }));
    expect(onChange).toHaveBeenCalledWith("u2");
  });
});
