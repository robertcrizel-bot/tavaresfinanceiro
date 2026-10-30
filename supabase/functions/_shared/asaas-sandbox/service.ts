import {
  BillingError,
  cents,
  type Contract,
  fail,
  type Gateway,
  identifier,
  type InboxEvent,
  type Method,
  paymentState,
  safeHostedUrl,
  type Snapshot,
  type Store,
  type Subscription,
} from "./domain.ts";

export class SandboxBilling {
  constructor(private store: Store, private gateway: Gateway) {}
  async status(user: string) {
    await this.store.allow(user);
    const contract = await this.store.byUser(user);
    const plan = await this.store.plan();
    let checkoutUrl = contract?.state === "pending" && !contract.cancelled
      ? contract.checkout_url
      : null;
    if (
      contract?.method === "PIX" && contract.subscription_id &&
      !contract.cancelled &&
      !["creating", "reconciliation_required"].includes(contract.state)
    ) {
      const invoices = await this.gateway.payments({
        subscription: contract.subscription_id,
      });
      const pending = invoices.filter((p) =>
        p.customer === contract.customer_id &&
        p.subscription === contract.subscription_id &&
        p.billingType === "PIX" && cents(p.value) === plan.price_cents &&
        ["PENDING", "OVERDUE"].includes(p.status)
      ).sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate)
      )[0];
      checkoutUrl = pending?.invoiceUrl
        ? safeHostedUrl(pending.invoiceUrl)
        : null;
    }
    return {
      plan,
      contract: contract
        ? {
          state: contract.state === "active" &&
              (!contract.expires_at ||
                Date.parse(contract.expires_at) <= Date.now())
            ? "overdue"
            : contract.state,
          method: contract.method,
          expires_at: contract.expires_at,
          checkout_url: checkoutUrl,
        }
        : null,
    };
  }
  async start(user: string, method: Method, name: string, cpf: string) {
    const { contract, plan, fresh } = await this.store.claim(user, method);
    if (!fresh) return this.status(user);
    try {
      const customer = await this.gateway.customer(user, name, cpf);
      await this.store.progress(contract, customer);
      if (method === "CREDIT_CARD") {
        const checkout = await this.gateway.checkout(contract, plan, customer);
        await this.store.progress(
          contract,
          customer,
          undefined,
          checkout.id,
          safeHostedUrl(checkout.url),
        );
      } else {
        const subscription = await this.gateway.subscribe(
          contract,
          plan,
          customer,
        );
        // Save the subscription even if the first hosted invoice is not ready.
        await this.store.progress(contract, customer, subscription);
        const payments = await this.gateway.payments({ subscription });
        const first = payments.find((p) =>
          p.customer === customer && p.subscription === subscription &&
          p.billingType === "PIX" && cents(p.value) === plan.price_cents
        );
        if (!first?.invoiceUrl) fail("PIX_INVOICE_NOT_READY");
        await this.store.progress(
          contract,
          customer,
          subscription,
          undefined,
          safeHostedUrl(first.invoiceUrl),
        );
      }
    } catch {
      await this.store.uncertain(contract);
      // No retry of an ambiguous POST. IDs remain for operator reconciliation.
      fail("CONTRACT_REQUIRES_RECONCILIATION");
    }
    return this.status(user);
  }
  async cancel(user: string) {
    await this.store.allow(user);
    const contract = await this.store.byUser(user);
    if (!contract) fail("CONTRACT_NOT_FOUND", 404);
    if (!contract.cancelled) {
      if (contract.subscription_id) {
        await this.gateway.cancelSubscription(contract.subscription_id);
      } else if (contract.checkout_id) {
          // Payment can finish before the first webhook binds its subscription.
          // Prove the linkage now instead of trying to cancel an already paid checkout.
          const payments = await this.gateway.payments({ checkoutSession: contract.checkout_id });
          const paid = payments.find(p => p.customer === contract.customer_id && p.subscription);
          if (paid) {
            const sub = await this.gateway.subscription(paid.subscription);
            if (sub.id !== paid.subscription) fail("SUBSCRIPTION_MISMATCH");
            await this.verifiedSubscription(contract, sub, true);
            await this.gateway.cancelSubscription(sub.id);
          } else await this.gateway.cancelCheckout(contract.checkout_id);
      } else fail("CONTRACT_REQUIRES_RECONCILIATION");
      await this.store.cancel(user);
    }
    return this.status(user);
  }
  private async verifiedSubscription(
    contract: Contract,
    sub: Subscription,
    checkoutVerified = false,
  ): Promise<Snapshot> {
    const plan = await this.store.plan();
    if (!["ACTIVE", "INACTIVE", "EXPIRED"].includes(sub.status)) {
      fail("UNKNOWN_SUBSCRIPTION_STATUS");
    }
    if (
      sub.customer !== contract.customer_id ||
      sub.billingType !== contract.method ||
      cents(sub.value) !== plan.price_cents || sub.cycle !== plan.cycle
    ) fail("SUBSCRIPTION_MISMATCH");
    if (contract.subscription_id && sub.id !== contract.subscription_id) {
      fail("SUBSCRIPTION_MISMATCH");
    }
    if (
      !contract.subscription_id &&
      !(contract.method === "CREDIT_CARD" && checkoutVerified)
    ) fail("UNVERIFIED_CHECKOUT");
    return {
      customer_id: sub.customer,
      subscription_id: sub.id,
      method: sub.billingType,
      value_cents: cents(sub.value),
      cycle: sub.cycle,
      checkout_verified: checkoutVerified,
      subscription_status: sub.deleted || sub.status !== "ACTIVE"
        ? "cancelled"
        : "active",
    };
  }
  private async applyPayment(event: InboxEvent, token: string, id: string) {
    const payment = await this.gateway.payment(id);
    if (payment.id !== id || !payment.subscription) fail("UNMATCHED_PAYMENT");
    let contract = await this.store.bySubscription(payment.subscription);
    let checkoutVerified = false;
    if (!contract) {
      contract = await this.store.byCustomer(payment.customer);
      if (!contract?.checkout_id || contract.method !== "CREDIT_CARD") {
        fail("UNMATCHED_PAYMENT");
      }
      const checkoutPayments = await this.gateway.payments({
        checkoutSession: contract.checkout_id,
      });
      const expectedCustomer = contract.customer_id;
      checkoutVerified = checkoutPayments.some((p) =>
        p.id === payment.id && p.customer === expectedCustomer &&
        p.subscription === payment.subscription
      );
    }
    let sub: Subscription;
    try {
      sub = await this.gateway.subscription(payment.subscription);
    } catch (error) {
      if (
        !(error instanceof BillingError) ||
        error.code !== "GATEWAY_NOT_FOUND" ||
          (contract.subscription_id !== payment.subscription && !checkoutVerified)
      ) throw error;
      const plan = await this.store.plan();
      sub = {
        id: payment.subscription,
        customer: contract.customer_id ?? fail("CUSTOMER_MISMATCH"),
        value: plan.price_cents / 100,
        cycle: plan.cycle,
        billingType: contract.method,
        status: "INACTIVE",
      };
    }
    if (sub.id !== payment.subscription) fail("SUBSCRIPTION_MISMATCH");
    const snapshot = await this.verifiedSubscription(
      contract,
      sub,
      checkoutVerified,
    );
    if (
      payment.customer !== snapshot.customer_id ||
      payment.billingType !== snapshot.method ||
      cents(payment.value) !== snapshot.value_cents ||
      !/^\d{4}-\d{2}-\d{2}$/.test(payment.dueDate)
    ) fail("PAYMENT_MISMATCH");
    await this.store.apply(event, token, contract, {
      ...snapshot,
      payment_id: identifier(payment.id),
      status: paymentState(payment, event.event_type),
      due_date: payment.dueDate,
    });
  }
  private async process(event: InboxEvent, token: string) {
    if (event.resource_kind === "payment") {
      return this.applyPayment(event, token, event.resource_id);
    }
    if (event.resource_kind === "checkout") {
      const contract = await this.store.byCheckout(event.resource_id);
      if (!contract) fail("UNMATCHED_CHECKOUT");
      if (event.event_type === "CHECKOUT_PAID") {
        const payments = await this.gateway.payments({
          checkoutSession: event.resource_id,
        });
        const payment = payments.find((p) =>
          p.customer === contract.customer_id && p.subscription
        );
        if (!payment) fail("UNMATCHED_PAYMENT");
        return this.applyPayment(event, token, payment.id);
      }
      // Journey events never revoke a paid subscription. A delayed EXPIRED or
      // CANCELED notification cannot undo a later canonical payment. Explicit
      // cancellation uses the authenticated cancel action and provider API.
      return this.store.apply(event, token, null, null);
    }
    const contract = await this.store.bySubscription(event.resource_id);
    if (!contract) fail("UNMATCHED_SUBSCRIPTION");
    let sub: Subscription;
    try {
      sub = await this.gateway.subscription(event.resource_id);
    } catch (error) {
      if (
        !(error instanceof BillingError) ||
        error.code !== "GATEWAY_NOT_FOUND" ||
        event.event_type !== "SUBSCRIPTION_DELETED"
      ) throw error;
      const plan = await this.store.plan();
      sub = {
        id: event.resource_id,
        customer: contract.customer_id ?? fail("CUSTOMER_MISMATCH"),
        value: plan.price_cents / 100,
        cycle: plan.cycle,
        billingType: contract.method,
        status: "INACTIVE",
      };
    }
    if (sub.id !== event.resource_id) fail("SUBSCRIPTION_MISMATCH");
    await this.store.apply(
      event,
      token,
      contract,
      await this.verifiedSubscription(contract, sub),
    );
  }
  async drain() {
    const token = crypto.randomUUID();
    if (!await this.store.lease(token)) return { processed: 0 };
    const started = Date.now();
    let processed = 0;
    try {
      for (const event of await this.store.pending()) {
        if (Date.now() - started > 40000) break;
        if (!await this.store.lease(token)) break;
        try {
          await this.process(event, token);
          processed++;
        } catch {
          await this.store.retry(event);
        }
      }
      if (await this.store.lease(token)) await this.store.refresh(token);
    } finally {
      await this.store.lease(token, true);
    }
    return { processed };
  }
}

export function validateStart(body: Record<string, unknown>) {
  if (
    Object.keys(body).some((k) =>
      !["action", "method", "name", "cpfCnpj"].includes(k)
    ) || !["PIX", "CREDIT_CARD"].includes(String(body.method))
  ) fail("INVALID_REQUEST", 400);
  if (
    typeof body.name !== "string" || body.name.trim().length < 2 ||
    body.name.length > 120 || typeof body.cpfCnpj !== "string" ||
    !/^\d{11}(\d{3})?$/.test(body.cpfCnpj)
  ) fail("INVALID_TEST_CUSTOMER", 400);
  return {
    method: body.method as Method,
    name: body.name.trim(),
    cpf: body.cpfCnpj,
  };
}

// Only resource identifiers are retained. No raw webhook or card/customer data.
export function parseEvent(
  body: Record<string, unknown>,
): Omit<InboxEvent, "attempts"> {
  const type = String(body.event);
  const kind = type.startsWith("PAYMENT_")
    ? "payment"
    : type.startsWith("SUBSCRIPTION_")
    ? "subscription"
    : type.startsWith("CHECKOUT_")
    ? "checkout"
    : null;
  if (!kind || !/^[A-Z_]{1,80}$/.test(type)) fail("UNSUPPORTED_EVENT", 400);
  const resource = body[kind];
  if (!resource || typeof resource !== "object") fail("INVALID_EVENT", 400);
  return {
    event_id: identifier(body.id),
    event_type: type,
    resource_kind: kind,
    resource_id: identifier((resource as Record<string, unknown>).id),
  };
}
