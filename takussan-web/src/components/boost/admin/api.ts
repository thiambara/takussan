import { appelBff } from '@/lib/bff';
import { cheminApi } from '@/lib/chemin-api';
import type { PaginationMeta } from '@/types/api';
import type { BoostKind, BoostProduct, BoostStatus, BoostVariant, CreditLot, CreditMovement, PropertyBoost } from '../types';

/** TCK-633 lot F — la console des crédits et de la mise en avant, par le relais `/api/super-admin/*`. */
export interface CreditWallet {
  readonly id: number;
  readonly name: string;
  readonly status: string | null;
  readonly balance: number;
  readonly next_expiry_at: string | null;
}

export interface CreditWalletDetail {
  readonly data: {
    readonly agency: { readonly id: number; readonly name: string; readonly status: string | null };
    readonly balance: number;
    readonly lots: readonly CreditLot[];
  };
  readonly movements: readonly CreditMovement[];
  readonly meta: PaginationMeta;
}

export interface BoostStatsRow {
  readonly date: string;
  readonly impressions: number;
  readonly clicks: number;
  readonly ctr: number;
}

export interface BoostStatsResponse {
  readonly data: readonly BoostStatsRow[];
  readonly totals: { readonly impressions: number; readonly clicks: number; readonly ctr: number };
  /** TCK-2525 — les places « Mise en avant » créées sur la période, et les crédits mouvementés pour elles. */
  readonly spotlights?: BoostStatsSpotlights;
}

export interface BoostStatsSpotlights {
  readonly purchased: number;
  readonly offered: number;
  readonly credits_spent: number;
  readonly credits_refunded: number;
}

export interface NewBoostProduct {
  readonly kind: BoostKind;
  readonly variant?: BoostVariant | null;
  readonly duration_days: number;
  readonly price_credits: number;
}

export function fetchBoostProducts(): Promise<{ readonly data: readonly BoostProduct[] }> {
  return appelBff('/api/super-admin/boost-products');
}

export function createBoostProduct(body: NewBoostProduct): Promise<{ readonly data: BoostProduct }> {
  return appelBff('/api/super-admin/boost-products', { method: 'POST', body });
}

export function updateBoostProduct(
  id: number,
  body: { readonly price_credits?: number; readonly is_active?: boolean },
): Promise<{ readonly data: BoostProduct }> {
  return appelBff(cheminApi`/api/super-admin/boost-products/${id}`, { method: 'PATCH', body });
}

export function fetchCreditWallets(params: { readonly search?: string; readonly page?: number }): Promise<{ readonly data: readonly CreditWallet[]; readonly meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  qs.set('page', String(params.page ?? 1));
  return appelBff(cheminApi`/api/super-admin/credit-wallets${qs}`);
}

export function fetchCreditWallet(agencyId: number, page = 1): Promise<CreditWalletDetail> {
  return appelBff(cheminApi`/api/super-admin/credit-wallets/${agencyId}${new URLSearchParams({ page: String(page) })}`);
}

export function adjustCreditWallet(
  agencyId: number,
  body: { readonly amount: number; readonly reason: string },
): Promise<{ readonly data: { readonly balance: number; readonly lot: CreditLot | null } }> {
  return appelBff(cheminApi`/api/super-admin/credit-wallets/${agencyId}/adjustments`, { method: 'POST', body });
}

export function fetchAdminBoosts(params: { readonly status?: BoostStatus | ''; readonly page?: number }): Promise<{ readonly data: readonly PropertyBoost[]; readonly meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('filter[status]', params.status);
  qs.set('page', String(params.page ?? 1));
  return appelBff(cheminApi`/api/super-admin/boosts${qs}`);
}

export function cancelBoost(id: number, body: { readonly refund: boolean; readonly reason: string }): Promise<{ readonly data: PropertyBoost }> {
  return appelBff(cheminApi`/api/super-admin/boosts/${id}/cancel`, { method: 'POST', body });
}

export function offerBoost(propertyId: number, body: { readonly product_id: number; readonly reason: string }): Promise<{ readonly data: PropertyBoost }> {
  return appelBff(cheminApi`/api/super-admin/properties/${propertyId}/offered-boost`, { method: 'POST', body });
}

export function fetchBoostStats(params: { readonly from: string; readonly to: string }): Promise<BoostStatsResponse> {
  return appelBff(cheminApi`/api/super-admin/boost-stats${new URLSearchParams(params)}`);
}

/** TCK-2520 (ADR-0092) — une place « Mise en avant » de l'annuaire des agences, offerte par la plateforme. */
export interface AgencySpotlight {
  readonly id: number;
  readonly agency_id: number;
  readonly agency: { readonly id: number; readonly name: string; readonly slug: string; readonly status: string | null } | null;
  readonly geo_city_id: number | null;
  readonly city: { readonly id: number; readonly name: string } | null;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly note: string | null;
  readonly granted_by: { readonly id: number; readonly name: string } | null;
  /** TCK-2525 — offerte par la plateforme, ou achetée en crédits par l'agence. */
  readonly origin: AgencySpotlightOrigin;
  /** Le prix figé à l'achat ; nul pour une place offerte. */
  readonly price_credits: number | null;
  readonly purchased_by: { readonly id: number; readonly name: string } | null;
  /** La libération (suspension, retrait d'une place achetée) ; la place reste dans l'historique. */
  readonly cancelled_at: string | null;
  readonly refunded_credits: number | null;
}

export type AgencySpotlightOrigin = 'offered' | 'purchased';

export type AgencySpotlightWhen = '' | 'current' | 'upcoming' | 'past';

export interface NewAgencySpotlight {
  readonly agency_id: number;
  readonly geo_city_id: number | null;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly note: string;
}

export interface AgencyChoice {
  readonly id: number;
  readonly name: string;
}

export function fetchAgencySpotlights(params: { readonly when?: AgencySpotlightWhen; readonly page?: number }): Promise<{ readonly data: readonly AgencySpotlight[]; readonly meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.when) qs.set('filter[when]', params.when);
  qs.set('page', String(params.page ?? 1));
  return appelBff(cheminApi`/api/super-admin/agency-spotlights${qs}`);
}

export function createAgencySpotlight(body: NewAgencySpotlight): Promise<{ readonly data: AgencySpotlight }> {
  return appelBff('/api/super-admin/agency-spotlights', { method: 'POST', body });
}

export function deleteAgencySpotlight(id: number): Promise<unknown> {
  return appelBff(cheminApi`/api/super-admin/agency-spotlights/${id}`, { method: 'DELETE' });
}

/** Les agences actives dont le nom contient la saisie — le choix de l'agence à mettre en avant. */
export function searchActiveAgencies(search: string): Promise<{ readonly data: readonly AgencyChoice[] }> {
  const qs = new URLSearchParams({ 'filter[search]': search, 'filter[status]': 'active', per_page: '10' });
  return appelBff(cheminApi`/api/super-admin/agencies${qs}`);
}
