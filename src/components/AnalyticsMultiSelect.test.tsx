import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { AnalyticsMultiSelect } from "@/components/AnalyticsMultiSelect";

function Example() {
  const [selected, setSelected] = useState<string[]>([]);
  return <AnalyticsMultiSelect id="test-filter" label="Categorias" emptyLabel="Todas as categorias"
    countLabel={count => `${count} categorias selecionadas`} selected={selected} onChange={setSelected}
    options={[{ value: "food", label: "Alimentação" }, { value: "health", label: "Saúde/Farmácia" }, { value: "travel", label: "Viagens" }]} />;
}

describe("AnalyticsMultiSelect", () => {
  it("keeps the real popover open while checking, unchecking, selecting all and clearing", () => {
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Categorias" });
    expect(trigger).toHaveTextContent("Todas as categorias");
    fireEvent.click(trigger);
    const menu = screen.getByRole("dialog", { name: "Categorias" });
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Alimentação" }));
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Saúde/Farmácia" }));
    expect(trigger).toHaveTextContent("2 categorias selecionadas");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Alimentação" }));
    expect(within(menu).getByRole("checkbox", { name: "Alimentação" })).not.toBeChecked();
    expect(trigger).toHaveTextContent("Saúde/Farmácia");
    fireEvent.click(within(menu).getByRole("button", { name: "Selecionar todas" }));
    expect(within(menu).getAllByRole("checkbox").every(input => (input as HTMLInputElement).checked)).toBe(true);
    expect(trigger).toHaveTextContent("3 categorias selecionadas");
    fireEvent.click(within(menu).getByRole("button", { name: "Limpar seleção" }));
    expect(within(menu).getAllByRole("checkbox").every(input => !(input as HTMLInputElement).checked)).toBe(true);
    expect(trigger).toHaveTextContent("Todas as categorias");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
