import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.101.1";
import {
  BillingError,
  type Contract,
  type InboxEvent,
  type Method,
  type Plan,
  type Snapshot,
  type Store,
} from "./domain.ts";
import { AsaasSandbox, sandboxConfig } from "./gateway.ts";
import { handler } from "./http.ts";
import { SandboxBilling } from "./service.ts";

class DatabaseStore implements Store {
  constructor(private db: SupabaseClient) {}
  private async rpc<T>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const { data, error } = await this.db.rpc(name, args);
    if (error) {
      throw new BillingError(
        error.code === "23505"
          ? "CONTRACT_REQUIRES_RECONCILIATION"
          : "SANDBOX_DATABASE_REJECTED",
        error.code === "42501" ? 403 : 409,
      );
    }
    return data as T;
  }
  allow(user: string) {
    return this.rpc<void>("asaas_sandbox_assert_user", { p_user: user });
  }
  async plan() {
    const { data, error } = await this.db.from("asaas_sandbox_plans").select(
      "*",
    ).eq("id", "financecontrol-monthly").single();
    if (error) throw new BillingError("PLAN_UNAVAILABLE", 503);
    return data as Plan;
  }
  claim(user: string, method: Method) {
    return this.rpc<{ contract: Contract; plan: Plan; fresh: boolean }>(
      "asaas_sandbox_claim",
      { p_user: user, p_method: method },
    );
  }
  progress(
    c: Contract,
    customer: string,
    subscription?: string,
    checkout?: string,
    url?: string,
  ) {
    return this.rpc<void>("asaas_sandbox_progress", {
      p_id: c.id,
      p_token: c.creation_token,
      p_customer: customer,
      p_subscription: subscription ?? null,
      p_checkout: checkout ?? null,
      p_url: url ?? null,
    });
  }
  uncertain(c: Contract) {
    return this.rpc<void>("asaas_sandbox_creation_uncertain", {
      p_id: c.id,
      p_token: c.creation_token,
    });
  }
  private async find(field: string, value: string) {
    const { data, error } = await this.db.from("asaas_sandbox_contracts")
      .select("*").eq(field, value).maybeSingle();
    if (error) throw new BillingError("CONTRACT_UNAVAILABLE", 503);
    return data as Contract | null;
  }
  byUser(user: string) {
    return this.find("user_id", user);
  }
  bySubscription(id: string) {
    return this.find("subscription_id", id);
  }
  byCustomer(id: string) {
    return this.find("customer_id", id);
  }
  byCheckout(id: string) {
    return this.find("checkout_id", id);
  }
  cancel(user: string) {
    return this.rpc<void>("asaas_sandbox_cancel", { p_user: user });
  }
  enqueue(event: Omit<InboxEvent, "attempts">) {
    return this.rpc<void>("asaas_sandbox_enqueue", {
      p_id: event.event_id,
      p_type: event.event_type,
      p_kind: event.resource_kind,
      p_resource: event.resource_id,
    });
  }
  lease(token: string, release = false) {
    return this.rpc<boolean>("asaas_sandbox_worker_lease", {
      p_token: token,
      p_release: release,
    });
  }
  async pending() {
    const { data, error } = await this.db.from("asaas_sandbox_events").select(
      "*",
    ).eq("state", "pending").lt("attempts", 10).order("created_at").limit(10);
    if (error) throw new BillingError("INBOX_UNAVAILABLE", 503);
    return data as InboxEvent[];
  }
  apply(
    event: InboxEvent,
    token: string,
    contract: Contract | null,
    snapshot: Snapshot | null,
  ) {
    return this.rpc<void>("asaas_sandbox_apply", {
      p_event: event.event_id,
      p_token: token,
      p_contract: contract?.id ?? null,
      p_snapshot: snapshot ?? {},
      p_ignored: !contract,
    });
  }
  async retry(event: InboxEvent) {
    const { error } = await this.db.from("asaas_sandbox_events").update({
      attempts: event.attempts + 1,
      error_code: "RECONCILIATION_PENDING",
    }).eq("event_id", event.event_id).eq("state", "pending");
    if (error) throw new BillingError("INBOX_UNAVAILABLE", 503);
  }
  refresh(token: string) {
    return this.rpc<void>("asaas_sandbox_refresh", { p_token: token });
  }
}

export function sandboxEndpoint(kind: "checkout" | "webhook" | "worker") {
  return async (request: Request): Promise<Response> => {
    try {
      const config = sandboxConfig((name) => Deno.env.get(name));
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!key) throw new BillingError("SANDBOX_NOT_CONFIGURED", 503);
      const db = createClient(Deno.env.get("SUPABASE_URL")!, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const store = new DatabaseStore(db);
      return await handler(
        kind,
        config,
        store,
        new SandboxBilling(store, new AsaasSandbox(config)),
        async (token) => {
          const { data, error } = await db.auth.getUser(token);
          return error ? null : data.user?.id ?? null;
        },
      )(request);
    } catch {
      return new Response(JSON.stringify({ error: "SANDBOX_NOT_CONFIGURED" }), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
  };
}
