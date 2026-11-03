import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SandboxSubscription from "./SandboxSubscription";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  user: { id: "sandbox-user" },
}));
vi.mock(
  "@/contexts/AuthContext",
  () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }),
);
vi.mock(
  "@/integrations/supabase/client",
  () => ({ supabase: { functions: { invoke: mocks.invoke } } }),
);
const empty = {
  plan: { name: "FinanceControl Mensal", price_cents: 1490, cycle: "MONTHLY" },
  contract: null,
};
const show = () =>
  render(
    <MemoryRouter>
      <SandboxSubscription />
    </MemoryRouter>,
  );
describe("Sandbox subscription interface with mocked backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/assinatura-sandbox");
    mocks.invoke.mockResolvedValue({ data: empty, error: null });
  });
  it("loads the server plan and sends no price, identity or gateway identifier", async () => {
    show();
    await screen.findByText("FinanceControl Mensal");
    expect(screen.getByText(/14,90/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome fictício"), {
      target: { value: "Cliente Teste" },
    });
    fireEvent.change(screen.getByLabelText(/CPF\/CNPJ/), {
      target: { value: "12345678909" },
    });
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), {
      target: { value: "CREDIT_CARD" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Iniciar contratação de teste" }),
    );
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith("asaas-sandbox-checkout", {
        body: {
          action: "start",
          method: "CREDIT_CARD",
          name: "Cliente Teste",
          cpfCnpj: "12345678909",
        },
      })
    );
    expect(screen.getByText(/Pix convencional não autoriza débito automático/))
      .toBeInTheDocument();
  });
  it("a success callback only refreshes server status and never grants access", async () => {
    window.history.replaceState({}, "", "/assinatura-sandbox?return=success");
    show();
    await screen.findByText("FinanceControl Mensal");
    expect(
      screen.getByText(/O acesso depende da confirmação recebida no servidor/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Assinatura ativa")).not.toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("asaas-sandbox-checkout", {
      body: { action: "status" },
    });
  });
  it("displays a refusal and cancels without accepting a client contract ID", async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        ...empty,
        contract: {
          state: "payment_failed",
          method: "CREDIT_CARD",
          expires_at: null,
          checkout_url: null,
        },
      },
      error: null,
    });
    show();
    await screen.findByText("Pagamento recusado");
    fireEvent.click(
      screen.getByRole("button", { name: "Cancelar futuras cobranças" }),
    );
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith("asaas-sandbox-checkout", {
        body: { action: "cancel" },
      })
    );
  });
  it.each(["cancelled", "expired"])(
    "handles %s callback without declaring payment",
    async (returned) => {
      window.history.replaceState(
        {},
        "",
        `/assinatura-sandbox?return=${returned}`,
      );
      show();
      await screen.findByText("FinanceControl Mensal");
      expect(screen.queryByText("Assinatura ativa")).not.toBeInTheDocument();
    },
  );
  it("reports network/configuration failure without fake success", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new Error("private backend error"),
    });
    show();
    expect(await screen.findByRole("alert")).not.toHaveTextContent(
      "private backend error",
    );
    expect(screen.queryByText("Assinatura ativa")).not.toBeInTheDocument();
  });
});
