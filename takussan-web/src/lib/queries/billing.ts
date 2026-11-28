import { appelBff } from '@/lib/bff';
import type { AgencySubscriptionResponse } from '@/types/super-admin';
import { cheminApi } from '@/lib/chemin-api';

/** Les colonnes de l'abonnement que l'écran lit (sparse fieldsets) ; `include=plan` porte le prix. */
export const AGENCY_SUBSCRIPTION_FIELDS =
  'id,agency_id,plan_id,status,trial_ends_at,current_period_start,current_period_end,ended_at,platform_fee_pct_override,limits_override,created_at,updated_at';

export async function fetchMeSubscription(): Promise<AgencySubscriptionResponse> {
  const qs = new URLSearchParams();
  qs.set('fields[agency_subscriptions]', AGENCY_SUBSCRIPTION_FIELDS);
  qs.set('include', 'plan');
  return appelBff<AgencySubscriptionResponse>(cheminApi`/api/me/subscription?${qs.toString()}`);
}
