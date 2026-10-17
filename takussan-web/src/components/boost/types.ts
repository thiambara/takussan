import type { PaginationMeta } from '@/types/api';

/** TCK-633 lot F (ADR-0061) — les formes de l'API des crédits et du boost, propres au lot. */
export type BoostKind = 'bump' | 'featured' | 'badge';
export type BoostVariant = 'urgent' | 'price_drop';
export type BoostStatus = 'active' | 'paused' | 'ended' | 'cancelled' | 'refunded';
export type CreditLotOrigin = 'welcome' | 'admin_grant' | 'refund' | 'purchase';
export type CreditMovementType = 'grant' | 'spend' | 'refund' | 'expire' | 'admin_debit';
/** `organic` et `reserved` dans `data`, `sponsored` dans `sponsored` (contrat du ticket). */
export type BoostPlacement = 'organic' | 'reserved' | 'sponsored';

export interface BoostProduct {
  readonly id: number;
  readonly kind: BoostKind;
  readonly variant: BoostVariant | null;
  readonly duration_days: number;
  readonly price_credits: number;
  readonly is_active: boolean;
  readonly sort_order: number;
}

export interface CreditLot {
  readonly id: number;
  readonly origin: CreditLotOrigin;
  readonly initial_amount: number;
  readonly remaining_amount: number;
  readonly expires_at: string | null;
  readonly reason: string | null;
  readonly created_at: string;
}

export interface CreditMovement {
  readonly id: number;
  readonly type: CreditMovementType;
  readonly amount: number;
  readonly credit_lot_id: number;
  readonly property_boost_id: number | null;
  readonly actor_id: number | null;
  readonly reason: string | null;
  readonly created_at: string;
}

export interface PropertyBoost {
  readonly id: number;
  readonly property_id: number;
  readonly agency_id: number;
  readonly kind: BoostKind;
  readonly variant: BoostVariant | null;
  readonly status: BoostStatus;
  readonly price_credits: number;
  readonly duration_days: number;
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly ended_at: string | null;
  readonly remaining_seconds: number | null;
  readonly offered: boolean;
  readonly offer_reason: string | null;
  readonly refunded_credits: number | null;
  readonly cancel_reason: string | null;
  readonly property?: { readonly id: number; readonly title: string; readonly slug: string } | null;
  readonly agency?: { readonly id: number; readonly name: string } | null;
}

export interface CreditsResponse {
  readonly data: { readonly balance: number; readonly lots: readonly CreditLot[] };
  readonly movements: readonly CreditMovement[];
  readonly meta: PaginationMeta;
}

/** TCK-824 — `GET /api/properties/{id}/boosts` : `bump_available_at` est `null` hors délai de Remontée. */
export interface PropertyBoostsResponse {
  readonly data: readonly PropertyBoost[];
  readonly bump_available_at: string | null;
}

export interface BuyBoostResponse {
  readonly data: PropertyBoost;
  readonly balance: number;
}

/** Le corps d'un refus `credits.insufficient` (ADR-0032 : code + paramètres bruts). */
export function manqueDeCredits(erreur: unknown): { readonly missing: number; readonly balance: number } | null {
  const data = (erreur as { data?: { code?: unknown; params?: { missing?: unknown; balance?: unknown } } } | null)?.data;
  if (data?.code !== 'credits.insufficient') return null;
  return { missing: Number(data.params?.missing ?? 0), balance: Number(data.params?.balance ?? 0) };
}
