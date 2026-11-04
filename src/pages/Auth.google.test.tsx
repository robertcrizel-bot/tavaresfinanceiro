import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Auth from "@/pages/Auth";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mocks,
}));

describe("Auth optional Google sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithGoogle.mockResolvedValue(undefined);
  });

  it("offers Google sign-in alongside password login, without bypassing Beta", async () => {
    render(<MemoryRouter initialEntries={["/auth"]}><Auth /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByText(/acesso Beta continua sujeito à aprovação/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
    await waitFor(() => expect(mocks.signInWithGoogle).toHaveBeenCalledOnce());
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("also offers Google when registering, while preserving regular signup", () => {
    render(<MemoryRouter initialEntries={["/auth?mode=cadastro"]}><Auth /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Criar Conta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar com Google" })).toBeInTheDocument();
    expect(screen.getByText(/O cadastro não ativa uma assinatura/)).toBeInTheDocument();
  });
});
