import { beforeEach, describe, expect, it } from "vitest";
import { markOnboardingDone, requestOnboardingReopen, shouldShowOnboarding } from "@/lib/onboarding";

const now = Date.parse("2026-10-25T12:00:00Z");
describe("onboarding", () => {
  beforeEach(() => localStorage.clear());
  it("shows for new accounts (<=7 days)", () => expect(shouldShowOnboarding("u", "2026-10-20T12:00:00Z", now)).toBe(true));
  it("does not show for existing accounts", () => expect(shouldShowOnboarding("u", "2026-09-01T12:00:00Z", now)).toBe(false));
  it("shows only once", () => {
    markOnboardingDone("u");
    expect(shouldShowOnboarding("u", "2026-10-24T12:00:00Z", now)).toBe(false);
  });
  it("can be reopened from profile", () => {
    markOnboardingDone("u");
    requestOnboardingReopen("u");
    expect(shouldShowOnboarding("u", "2026-01-01T12:00:00Z", now)).toBe(true);
    markOnboardingDone("u");
    expect(shouldShowOnboarding("u", "2026-01-01T12:00:00Z", now)).toBe(false);
  });
});
