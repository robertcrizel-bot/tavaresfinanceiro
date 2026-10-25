/** Guided first access: preference stored only on this device (localStorage). */
export const ONBOARDING_NEW_ACCOUNT_DAYS = 7;
const doneKey = (userId: string) => `fc-onboarding-done:${userId}`;
const forceKey = (userId: string) => `fc-onboarding-reopen:${userId}`;

function store(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

export function isNewAccount(createdAt: string | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now - created <= ONBOARDING_NEW_ACCOUNT_DAYS * 86_400_000;
}

export function shouldShowOnboarding(userId: string | undefined, createdAt: string | undefined, now = Date.now()): boolean {
  if (!userId) return false;
  const s = store();
  if (!s) return false;
  if (s.getItem(forceKey(userId)) === "1") return true;
  if (s.getItem(doneKey(userId)) === "1") return false;
  return isNewAccount(createdAt, now);
}

export function markOnboardingDone(userId: string) {
  const s = store();
  if (!s) return;
  s.setItem(doneKey(userId), "1");
  s.removeItem(forceKey(userId));
}

export function requestOnboardingReopen(userId: string) {
  store()?.setItem(forceKey(userId), "1");
}
