import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert, AlertTitle, AlertDescription } from "./alert";

describe("Alert", () => {
  it("exposes the alert role for assistive tech", () => {
    render(
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Something to know.</AlertDescription>
      </Alert>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Heads up");
    expect(alert).toHaveTextContent("Something to know.");
  });

  it("applies destructive token classes for the destructive variant", () => {
    render(
      <Alert variant="destructive">
        <AlertDescription>Failed.</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole("alert").className).toContain("text-destructive");
  });

  it("defaults to the non-destructive variant", () => {
    render(
      <Alert>
        <AlertDescription>Info.</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole("alert").className).not.toContain("text-destructive");
  });
});
