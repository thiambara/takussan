import { ApiError } from '@/lib/api';
import type { AgencySubscriptionResponse } from '@/types/super-admin';
import { cheminApi } from '@/lib/chemin-api';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<T>;
}

/** Les colonnes de l'abonnement que l'écran lit (sparse fieldsets) ; `include=plan` porte le prix. */
export const AGENCY_SUBSCRIPTION_FIELDS =
  'id,agency_id,plan_id,status,trial_ends_at,current_period_start,current_period_end,ended_at,platform_fee_pct_override,limits_override,created_at,updated_at';

export async function fetchMeSubscription(): Promise<AgencySubscriptionResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[agency_subscriptions]', AGENCY_SUBSCRIPTION_FIELDS);
  qs.set('include', 'plan');
  const res = await fetch(cheminApi`/api/me/subscription?${qs.toString()}`, { credentials: 'include' });
  return jsonOrThrow<AgencySubscriptionResponse>(res);
}
