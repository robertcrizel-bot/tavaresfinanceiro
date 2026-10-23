/**
 * Only link to verified, hosted checkout domains. The URL is public build
 * configuration, never a merchant API key or payment confirmation.
 */
const trustedHosts = new Set([
  "asaas.com", "www.asaas.com",
  "pagbank.com.br", "www.pagbank.com.br",
  "pagseguro.uol.com.br",
]);
export function getBetaCheckoutUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "https:" || !trustedHosts.has(parsed.hostname)
        || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}
