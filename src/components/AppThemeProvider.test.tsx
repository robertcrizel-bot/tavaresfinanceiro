import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppThemeProvider, THEME_STORAGE_KEY } from "./AppThemeProvider";
import { ThemeToggle } from "./ThemeToggle";
import { TooltipProvider } from "./ui/tooltip";

function mount() {
  return render(<AppThemeProvider><TooltipProvider><ThemeToggle /></TooltipProvider></AppThemeProvider>);
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});
afterEach(cleanup);

describe("browser-local app theme", () => {
  it("defaults to dark without a saved choice", async () => {
    mount();
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("saves light, restores it on remount, and switches back to dark without touching financial preferences", async () => {
    localStorage.setItem("financial-preferences", "unchanged");
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Ativar tema claro" }));
    await waitFor(() => expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light"));
    expect(document.documentElement.classList.contains("light")).toBe(true);
    view.unmount();
    mount();
    await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Ativar tema escuro" }));
    await waitFor(() => expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("financial-preferences")).toBe("unchanged");
  });
});