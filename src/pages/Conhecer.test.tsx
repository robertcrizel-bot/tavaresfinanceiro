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
    expect(document.querySelector(".fv-hero-brand")).toHaveTextContent("FinVision");
    expect(document.querySelector(".fv-hero-brand .fv-brand-mark")).toBeInTheDocument();
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
    expect(document.querySelector(".fv-product-figure > img")).toHaveAttribute("src", "/landing/registros.webp");
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
    expect(ai).toHaveTextContent("Confira e corrija");
    expect(ai).toHaveTextContent("a leitura está sujeita a limites de uso");
    const signup = screen.getByText("Como faço o cadastro e solicito o Beta?").closest("details")!;
    expect(signup).toHaveTextContent("Solicitar análise de acesso");
    expect(signup).toHaveTextContent("O cadastro não libera o acesso automaticamente");
  });

  it("puts expense analysis and assisted receipt entry before the supporting features", () => {
    render(<MemoryRouter><Conhecer /></MemoryRouter>);
    const section = document.getElementById("recursos")!;
    const highlights = section.querySelectorAll(".fv-feature-highlights > article");
    expect(highlights).toHaveLength(2);
    expect(highlights[0]).toHaveAttribute("id", "analises-destaque");
    expect(highlights[1]).toHaveAttribute("id", "ia-destaque");
    expect(highlights[0]).toHaveTextContent("Veja para ondeseu dinheiro está indo.");
    expect(highlights[0]).toHaveTextContent("forma de pagamento");
    expect(highlights[0]).toHaveTextContent("Compare o mês atual com o anterior");
    expect(highlights[0]).toHaveTextContent("o que aumentou");
    expect(highlights[0].querySelector("img")).toHaveAttribute("src", "/landing/analises-overview.webp");
    const supporting = section.querySelectorAll(".fv-feature-grid .fv-eyebrow");
    expect([...supporting].map(element => element.textContent)).toEqual(["Dashboard financeiro", "Extratos", "Registros financeiros", "Previsões", "Contas e cartões"]);
    expect(section.querySelector(".fv-feature-grid .fv-feature-dashboard")).toHaveTextContent("Toda a sua vida financeira em uma só visão.");
    expect(section.querySelector(".fv-feature-dashboard img")).toHaveAttribute("src", "/landing/dashboard-content.webp");
    expect(section.querySelector(".fv-feature-dashboard .fv-small-feature-copy")).toHaveTextContent("Toda a sua vida financeira em uma só visão.");
    expect(section.querySelector(".fv-feature-dashboard .fv-text-link")).not.toBeInTheDocument();

    expect(section.querySelector(".fv-feature-grid .fv-feature-registros-focus")).toBeInTheDocument();
    expect(section.querySelector(".fv-feature-registros-focus img")).toHaveAttribute("src", "/landing/registros-focus.webp");

    expect(section.querySelector(".fv-feature-registros-focus .fv-small-feature-copy")).toHaveTextContent("Cada gasto, com os detalhes certos.");
  });

  it("opens the actual analysis view in the gallery from its benefit link", () => {
    render(<MemoryRouter><Conhecer /></MemoryRouter>);
    const link = screen.getByRole("link", { name: "Explorar as análises" });
    expect(link).toHaveAttribute("href", "#produto");
    fireEvent.click(link);
    expect(screen.getByRole("button", { name: "Análises", pressed: true })).toBeInTheDocument();
    expect(document.querySelector(".fv-product-figure > img")).toHaveAttribute("src", "/landing/analises.webp");
  });

  it("explains the IA benefit without pretending to run a receipt read or guarantee timing", () => {
    render(<MemoryRouter><Conhecer /></MemoryRouter>);
    const feature = document.getElementById("ia-destaque")!;
    expect(feature).toHaveTextContent("Leitura por IA. Menos digitação, mais praticidade.");
    expect(feature).toHaveTextContent("Tire uma foto ou envie um comprovante");
    expect(feature).toHaveTextContent("compartilhe comprovantes de Pix feitos ou recebidos, boletos ou fotos direto com o FinVision");
    expect(feature).toHaveTextContent("reconhece a conta cadastrada e deixa tudo pronto");
    expect(feature).toHaveTextContent("deixa tudo pronto para você conferir e salvar");
    expect(feature).toHaveTextContent("quando possível");
    expect(feature).toHaveTextContent("Itens incluídos");
    expect(feature).toHaveTextContent("Você revisa e confirma");
    expect(feature).toHaveTextContent("sujeita a limites de uso");
    expect(feature).toHaveTextContent("ILUSTRAÇÃO DEMO");
    expect(feature).toHaveTextContent("Nenhuma leitura é executada nesta página");
    expect(feature.querySelectorAll("input, form")).toHaveLength(0);
    expect(within(feature).getByRole("link", { name: "Experimentar a leitura por IA" })).toHaveAttribute("href", "/receipt");
    expect(document.getElementById("ia-fluxo")).toBeInTheDocument();
  });

  it("shows the automatic field prefill and identified purchase items inside the illustrative registration", () => {
    render(<MemoryRouter><Conhecer /></MemoryRouter>);
    const demo = document.getElementById("ia-fluxo")!;
    expect(demo).toHaveTextContent("Lançamento preenchido");
    expect(demo).toHaveTextContent("Estabelecimento / título");
    expect(demo).toHaveTextContent("Mercado Exemplo");
    expect(demo).toHaveTextContent("Valor preenchido");
    expect(demo).toHaveTextContent("R$ 248,70");
    expect(demo).toHaveTextContent("Data preenchida");
    expect(demo).toHaveTextContent("Categoria sugerida");
    const items = within(demo).getByRole("group", { name: "Itens incluídos automaticamente na descrição do cadastro, quando identificados" });
    expect(within(items).getAllByRole("listitem")).toHaveLength(3);
    for (const item of ["1 × Mercearia", "1 × Hortifruti", "1 × Arroz"]) expect(items).toHaveTextContent(item);
    expect(items).toHaveTextContent("Incluídos automaticamente quando identificados");
    expect(demo).toHaveTextContent("antes de salvar");
    expect(demo.querySelectorAll("input, form, button")).toHaveLength(0);
  });
});
