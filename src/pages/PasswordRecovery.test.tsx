import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PasswordRecovery from "@/pages/PasswordRecovery";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string },
  send: vi.fn(),
  update: vi.fn(),
  listener: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: {
    resetPasswordForEmail: mocks.send,
    updateUser: mocks.update,
    onAuthStateChange: mocks.listener,
  } },
}));
const renderPage = () => render(<MemoryRouter><PasswordRecovery /></MemoryRouter>);

describe("PasswordRecovery account self-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    window.history.replaceState({}, "", "/recuperar-senha");
    mocks.listener.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mocks.send.mockResolvedValue({ error: null });
    mocks.update.mockResolvedValue({ error: null });
  });

  it("offers a neutral email confirmation without leaking account existence", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "cliente@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link" }));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
    expect(mocks.send).toHaveBeenCalledWith("cliente@example.com",{
      redirectTo: window.location.origin + "/recuperar-senha?recovery=1",
    });
    expect(screen.getByRole("status").textContent).toMatch(/Se este e-mail estiver cadastrado/);
  });

  it("does not expose credential errors or user-existence details", async () => {
    mocks.send.mockResolvedValue({ error: { message: "account does not exist" } });
    renderPage();
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "unknown@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível enviar o link."));
    expect(screen.queryByText("account does not exist")).toBeNull();
  });

  it("prevents mismatch from updating password after recovery authentication", async () => {
    mocks.user = { id: "owner" };
    window.history.replaceState({}, "", "/recuperar-senha?recovery=1");
    renderPage();
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "NovoSegredo123" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "Diferente123" } });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("As senhas digitadas não coincidem");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates the recovered user's password, without persisting the secret", async () => {
    mocks.user = { id: "owner" };
    window.history.replaceState({}, "", "/recuperar-senha?recovery=1");
    renderPage();
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "NovoSegredo123" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "NovoSegredo123" } });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar senha" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ password: "NovoSegredo123" }));
  });
});
