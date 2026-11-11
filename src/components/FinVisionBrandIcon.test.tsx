import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinVisionBrandIcon } from "./FinVisionBrandIcon";

describe("FinVision navigation brand icon", () => {
  it("shows the existing app logo at a fixed square size", () => {
    render(<FinVisionBrandIcon />);
    const image = screen.getByRole("img", { name: "Logo FinVision" });
    expect(image).toHaveAttribute("src", "/finvision-icon.svg");
    expect(image).toHaveAttribute("width", "36");
    expect(image).toHaveAttribute("height", "36");
  });

  it("uses the compact logo in collapsed and mobile navigation", () => {
    render(<FinVisionBrandIcon size="sm" />);
    expect(screen.getByRole("img", { name: "Logo FinVision" })).toHaveAttribute("width", "32");
  });

  it("falls back to F if the image cannot load", () => {
    render(<FinVisionBrandIcon />);
    fireEvent.error(screen.getByRole("img", { name: "Logo FinVision" }));
    expect(screen.getByLabelText("FinVision")).toHaveTextContent("F");
  });
});
