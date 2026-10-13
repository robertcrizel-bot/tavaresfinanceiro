import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Profile from "@/pages/Profile";
import { BUILD_COMMIT } from "@/lib/build-info";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "ana@example.com", created_at: "2026-01-15T12:00:00Z" },
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { display_name: "Ana" } }) }),
      }),
    }),
  },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

describe("Profile version display", () => {
  it("shows the running build, build time and origin", async () => {
    render(<Profile />);
    expect(await screen.findByText("Versão do aplicativo")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Build: ${BUILD_COMMIT}`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Origem: ${window.location.origin}`))).toBeInTheDocument();
  });
});
