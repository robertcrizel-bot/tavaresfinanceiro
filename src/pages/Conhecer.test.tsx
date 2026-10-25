import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Conhecer from "@/pages/Conhecer";
import Demonstracao, { STORYBOARD } from "@/pages/Demonstracao";

describe("public pages", () => {
  it("landing shows R$ 14,90/mês and links to /auth, /beta and /demonstracao", () => {
    render(<MemoryRouter><Conhecer /></MemoryRouter>);
    expect(screen.getAllByText(/R\$ 14,90/).length).toBeGreaterThan(0);
    const hrefs = screen.getAllByRole("link").map(l => l.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/auth", "/beta", "/demonstracao"]));
  });
  it("storyboard stays within 45–60 seconds", () => {
    render(<MemoryRouter><Demonstracao /></MemoryRouter>);
    const end = Number(STORYBOARD[STORYBOARD.length - 1].time.split("–")[1].replace("s", ""));
    expect(end).toBeGreaterThanOrEqual(45);
    expect(end).toBeLessThanOrEqual(60);
  });
});
