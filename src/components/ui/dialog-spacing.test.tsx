import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

describe("shared modal header close-button spacing", () => {
  it("reserves a dedicated trailing area for the dialog close button", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Controle da conta</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Controle da conta").parentElement).toHaveClass("pr-12");
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(close).toHaveClass("absolute", "right-3", "top-3", "h-8", "w-8", "z-10");
  });

  it("reserves the same space for the close button in slide-over panels", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Filtros").parentElement).toHaveClass("pr-12");
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(close).toHaveClass("absolute", "right-3", "top-3", "h-8", "w-8", "z-10");
  });
});
