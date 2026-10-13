import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppUpdateBanner } from "@/components/AppUpdateBanner";
import {
  __resetAppUpdateForTests,
  beginAppBusy,
  checkForAppUpdate,
  endAppBusy,
} from "@/lib/app-update";

const CURRENT_HTML = '<script type="module" crossorigin src="/assets/index-AAA.js"></script>';
const NEW_HTML = '<script type="module" crossorigin src="/assets/index-BBB.js"></script>';

async function markUpdateAvailable() {
  document.body.innerHTML = CURRENT_HTML;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => NEW_HTML }));
  await checkForAppUpdate();
}

describe("AppUpdateBanner", () => {
  beforeEach(() => {
    __resetAppUpdateForTests();
  });

  afterEach(() => {
    __resetAppUpdateForTests();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("renders nothing while no update is known", () => {
    render(<AppUpdateBanner />);
    expect(screen.queryByTestId("app-update-banner")).not.toBeInTheDocument();
  });

  it("announces a new version and reloads on demand when idle", async () => {
    await markUpdateAvailable();
    render(<AppUpdateBanner />);
    expect(screen.getByTestId("app-update-banner")).toHaveTextContent("Nova versão disponível.");

    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never exposes the reload control while an operation is busy", async () => {
    await markUpdateAvailable();
    beginAppBusy("form");
    render(<AppUpdateBanner />);
    expect(
      screen.getByText("Nova versão disponível — conclua a operação atual para atualizar."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Atualizar" })).not.toBeInTheDocument();

    act(() => {
      endAppBusy("form");
    });
    expect(screen.getByRole("button", { name: "Atualizar" })).toBeInTheDocument();
  });

  it("hides the banner after dismissal", async () => {
    await markUpdateAvailable();
    render(<AppUpdateBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dispensar aviso de atualização" }));
    expect(screen.queryByTestId("app-update-banner")).not.toBeInTheDocument();
  });
});
