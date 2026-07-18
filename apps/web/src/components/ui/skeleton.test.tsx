import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renders the pulse + muted-surface tokens and merges custom sizing", () => {
    const { container } = render(<Skeleton className="h-8 w-40" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("bg-muted");
    expect(el.className).toContain("h-8");
    expect(el.className).toContain("w-40");
  });
});
