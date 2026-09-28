import { env } from '../config/env';
import { PlanId } from '../config/plans';

/**
 * Payment provider boundary.
 *
 * PAYMENT_MODE=mock  -> plan changes apply immediately (great for demos and viva).
 * For production, replace `createCheckout` with Stripe Checkout / Razorpay Subscriptions,
 * and activate the plan from a signed webhook (see routes/billing.ts -> POST /webhook).
 */
export async function createCheckout(_workspaceId: string, plan: PlanId): Promise<{ mode: 'mock' | 'redirect'; url?: string; activate: boolean }> {
  if (env.paymentMode === 'mock') return { mode: 'mock', activate: true };
  throw new Error(`Payment provider not configured for plan "${plan}". Implement services/payments.ts.`);
}
