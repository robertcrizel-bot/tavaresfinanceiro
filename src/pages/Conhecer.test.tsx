import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("takes visitors straight to signup and explains the Beta release requirement", () => {
    render(<MemoryRouter><Conhecer /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Assuma o controledo seu dinheiro.");
    expect(screen.getByRole("link", { name: "Quero testar o FinVision" })).toHaveAttribute("href", "/auth?mode=cadastro");
    expect(screen.getByRole("link", { name: "Criar conta e solicitar acesso Beta" })).toHaveAttribute("href", "/auth?mode=cadastro");
    const plan = document.getElementById("plano")!;
    expect(plan).toHaveTextContent("R$ 14,90/mês");
    expect(plan).toHaveTextContent("Assinatura em preparação");
    expect(plan).toHaveTextContent("O acesso Beta depende de liberação");
    expect(plan).toHaveTextContent("Nenhum pagamento é solicitado nesta página");
    expect(screen.queryByRole("link", { name: /pagar|comprar|assinar/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").every(link => !/asaas|checkout|payment/.test(link.getAttribute("href") || ""))).toBe(true);
  });

  it("keeps one highlighted word and the full populated dashboard below the hero copy", () => {
    render(<MemoryRouter><Conhecer /></MemoryRouter>);
    const hero = screen.getByRole("heading", { level: 1 });
    expect(hero.querySelectorAll(".fv-green")).toHaveLength(1);
    expect(hero.querySelector(".fv-green")).toHaveTextContent("dinheiro.");
    const copy = document.querySelector(".fv-hero-copy")!;
    const product = document.querySelector(".fv-hero-product")!;
    expect(copy.parentElement?.children[1]).toBe(product);
    expect(within(copy as HTMLElement).getAllByRole("link")).toHaveLength(2);
    expect(product.querySelector("img")).toHaveAttribute("src", "/landing/dashboard.webp");
    expect(product.querySelector("img")).toHaveAttribute("width", "1440");
    expect(product.querySelector("img")).toHaveAttribute("alt", expect.stringContaining("DEMO"));
    expect(document.querySelector(".fv-floating-chart, .fv-floating-donut")).not.toBeInTheDocument();
  });

  it("opens mobile navigation and closes it after following an existing section anchor", () => {
    render(<MemoryRouter><Conhecer /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    const menu = screen.getByRole("navigation", { name: "Navegação móvel" });
    expect(screen.getByRole("button", { name: "Fechar menu" })).toHaveAttribute("aria-expanded", "true");
    const resources = within(menu).getByRole("link", { name: "Recursos" });
    expect(document.querySelector(resources.getAttribute("href")!)).toBeInTheDocument();
    fireEvent.click(resources);
    expect(screen.queryByRole("navigation", { name: "Navegação móvel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir menu" })).toHaveAttribute("aria-expanded", "false");
    for (const link of screen.getAllByRole("link")) {
      const href = link.getAttribute("href") || "";
      if (href.startsWith("#")) expect(document.querySelector(href)).toBeInTheDocument();
    }
  });

  it("switches real product images and their enlarge links together", () => {
    render(<MemoryRouter><Conhecer /></MemoryRouter>);
    const picker = screen.getByRole("group", { name: "Escolher tela do produto" });
    fireEvent.click(within(picker).getByRole("button", { name: "Análises" }));
    expect(within(picker).getByRole("button", { name: "Análises" })).toHaveAttribute("aria-pressed", "true");
    expect(within(picker).getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("img", { name: /Tela real de Análises/ })).toHaveAttribute("src", "/landing/analises.webp");
    expect(screen.getByRole("link", { name: /Ampliar captura de Análises/ })).toHaveAttribute("href", "/landing/analises.webp");
    fireEvent.click(within(picker).getByRole("button", { name: "Registros" }));
    expect(screen.getByRole("img", { name: /Tela real de Meus Registros/ })).toHaveAttribute("src", "/landing/registros.webp");
    expect(screen.getByRole("link", { name: /Ampliar captura de Registros/ })).toHaveAttribute("href", "/landing/registros.webp");
    for (const [label, image] of [["Extratos", "extratos"], ["Cartões", "contas"], ["Previsões", "previsoes"]]) {
      fireEvent.click(within(picker).getByRole("button", { name: label }));
      expect(within(picker).getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("link", { name: `Ampliar captura de ${label} em nova aba` })).toHaveAttribute("href", `/landing/${image}.webp`);
      expect(document.querySelector(".fv-product-figure > img")).toHaveAttribute("src", `/landing/${image}.webp`);
    }
    expect(document.querySelector(".fv-product-caption")).toHaveTextContent("DEMO — DADOS FICTÍCIOS");
    expect(document.querySelector(".fv-product-figure > img")).toHaveAttribute("alt", expect.stringContaining("DEMO"));
  });

  it("explains IA limitations and the existing signup/request flow in the FAQ", () => {
    render(<MemoryRouter><Conhecer /></MemoryRouter>);
    const questions = document.querySelectorAll("#faq details");
    expect(questions).toHaveLength(7);
    const ai = screen.getByText("Como funciona a leitura de comprovantes com IA?").closest("details")!;
    expect(ai).toHaveTextContent("conferir e corrigir");
    expect(ai).toHaveTextContent("não é um benefício garantido do plano Beta");
    const signup = screen.getByText("Como faço o cadastro e solicito o Beta?").closest("details")!;
    expect(signup).toHaveTextContent("Solicitar análise de acesso");
    expect(signup).toHaveTextContent("O cadastro não libera o acesso automaticamente");
  });
});
