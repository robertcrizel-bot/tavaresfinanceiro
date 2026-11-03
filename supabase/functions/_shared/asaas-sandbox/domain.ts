export type Method = "PIX" | "CREDIT_CARD";
export type Plan = {
  id: string;
  name: string;
  price_cents: number;
  currency: string;
  cycle: string;
};
export type Contract = {
  id: string;
  user_id: string;
  method: Method;
  state: string;
  creation_token: string;
  customer_id: string | null;
  subscription_id: string | null;
  checkout_id: string | null;
  checkout_url: string | null;
  expires_at: string | null;
  cancelled: boolean;
};
export type InboxEvent = {
  event_id: string;
  event_type: string;
  resource_kind: "payment" | "subscription" | "checkout";
  resource_id: string;
  attempts: number;
};
export type Subscription = {
  id: string;
  customer: string;
  value: number;
  cycle: string;
  billingType: Method;
  status: string;
  deleted?: boolean;
  externalReference?: string;
};
export type Payment = {
  id: string;
  customer: string;
  subscription: string;
  billingType: Method;
  value: number;
  status: string;
  dueDate: string;
  invoiceUrl?: string;
  refundedValue?: number;
  checkoutSession?: string;
};
export type Snapshot = {
  customer_id: string;
  subscription_id: string;
  method: Method;
  value_cents: number;
  cycle: string;
  subscription_status: "active" | "cancelled";
  checkout_verified?: boolean;
  payment_id?: string;
  status?: "pending" | "paid" | "failed" | "overdue" | "reversed";
  due_date?: string;
};
export class BillingError extends Error {
  constructor(public code: string, public status = 409) {
    super(code);
  }
}
export function fail(code: string, status = 409): never {
  throw new BillingError(code, status);
}
export function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_&.-]{1,200}$/.test(value) || value === "." || value === "..") {
    fail("INVALID_IDENTIFIER", 400);
  }
  return value as string;
}
export function cents(value: number): number {
  if (
    !Number.isFinite(value) ||
    Math.abs(value * 100 - Math.round(value * 100)) > 0.00001
  ) fail("INVALID_VALUE");
  return Math.round(value * 100);
}
export function safeHostedUrl(raw: string): string {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" || url.hostname !== "sandbox.asaas.com" ||
    url.port || url.username || url.password
  ) fail("NON_SANDBOX_CHECKOUT_URL");
  return url.href;
}
export function paymentState(
  payment: Payment,
  eventType: string,
): Snapshot["status"] {
  if (
    (payment.refundedValue ?? 0) > 0 ||
    [
      "REFUNDED",
      "REFUND_REQUESTED",
      "REFUND_IN_PROGRESS",
      "CHARGEBACK_REQUESTED",
      "CHARGEBACK_DISPUTE",
      "AWAITING_CHARGEBACK_REVERSAL",
    ].includes(payment.status)
  ) return "reversed";
  if (["CONFIRMED", "RECEIVED"].includes(payment.status)) return "paid";
  if (payment.status === "OVERDUE") return "overdue";
  if (
    payment.status === "DELETED" || payment.status === "DUNNING_REQUESTED" ||
    eventType === "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED" ||
    eventType === "PAYMENT_REPROVED_BY_RISK_ANALYSIS"
  ) return "failed";
  return "pending";
}
export interface Store {
  allow(user: string): Promise<void>;
  plan(): Promise<Plan>;
  claim(
    user: string,
    method: Method,
  ): Promise<{ contract: Contract; plan: Plan; fresh: boolean }>;
  progress(
    contract: Contract,
    customer: string,
    subscription?: string,
    checkout?: string,
    url?: string,
  ): Promise<void>;
  uncertain(contract: Contract): Promise<void>;
  byUser(user: string): Promise<Contract | null>;
  bySubscription(id: string): Promise<Contract | null>;
  byCustomer(id: string): Promise<Contract | null>;
  byCheckout(id: string): Promise<Contract | null>;
  cancel(user: string): Promise<void>;
  enqueue(event: Omit<InboxEvent, "attempts">): Promise<void>;
  lease(token: string, release?: boolean): Promise<boolean>;
  pending(): Promise<InboxEvent[]>;
  apply(
    event: InboxEvent,
    token: string,
    contract: Contract | null,
    snapshot: Snapshot | null,
  ): Promise<void>;
  retry(event: InboxEvent): Promise<void>;
  refresh(token: string): Promise<void>;
}
export interface Gateway {
  customer(user: string, name: string, cpf: string): Promise<string>;
  checkout(
    contract: Contract,
    plan: Plan,
    customer: string,
  ): Promise<{ id: string; url: string }>;
  subscribe(contract: Contract, plan: Plan, customer: string): Promise<string>;
  subscription(id: string): Promise<Subscription>;
  payment(id: string): Promise<Payment>;
  payments(
    filter: { subscription?: string; checkoutSession?: string },
  ): Promise<Payment[]>;
  cancelSubscription(id: string): Promise<void>;
  cancelCheckout(id: string): Promise<void>;
}
