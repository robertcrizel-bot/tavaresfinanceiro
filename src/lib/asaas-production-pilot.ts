/** Frontend pilot entrypoint stays absent unless explicitly enabled on the verified live site. */
export function isProductionPilotRouteEnabled(flag: string | undefined, hostname: string, supabaseUrl: string | undefined) {
  // The UI is only discoverable on the official production origin, backed by
  // the exact live database. Real checkout is restricted to the server-side
  // asaas_prod_testers allowlist (currently one pilot user), not this flag.
  // Keep a deployment-time explicit kill switch for emergencies.
  if (flag === "false" || hostname !== "finvision2026.lovable.app") return false;
  try {
    const url = new URL(supabaseUrl || "");
    return url.origin === "https://onhmpgevkttysbfllhjq.supabase.co";
  } catch {
    return false;
  }
}

export function verifiedAsaasProductionPaymentUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.port || url.username || url.password ||
      !["asaas.com", "www.asaas.com"].includes(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}
