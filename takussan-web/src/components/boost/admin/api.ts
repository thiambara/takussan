import { ApiError } from '@/lib/api';
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
}

export interface NewBoostProduct {
  readonly kind: BoostKind;
  readonly variant?: BoostVariant | null;
  readonly duration_days: number;
  readonly price_credits: number;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.json() as Promise<T>;
}

function lire<T>(url: string): Promise<T> {
  return fetch(url, { credentials: 'include' }).then((res) => jsonOrThrow<T>(res));
}

function ecrire<T>(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  return fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => jsonOrThrow<T>(res));
}

export function fetchBoostProducts(): Promise<{ readonly data: readonly BoostProduct[] }> {
  return lire('/api/super-admin/boost-products');
}

export function createBoostProduct(body: NewBoostProduct): Promise<{ readonly data: BoostProduct }> {
  return ecrire('/api/super-admin/boost-products', 'POST', body);
}

export function updateBoostProduct(
  id: number,
  body: { readonly price_credits?: number; readonly is_active?: boolean },
): Promise<{ readonly data: BoostProduct }> {
  return ecrire(cheminApi`/api/super-admin/boost-products/${id}`, 'PATCH', body);
}

export function fetchCreditWallets(params: { readonly search?: string; readonly page?: number }): Promise<{ readonly data: readonly CreditWallet[]; readonly meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  qs.set('page', String(params.page ?? 1));
  return lire(cheminApi`/api/super-admin/credit-wallets${qs}`);
}

export function fetchCreditWallet(agencyId: number, page = 1): Promise<CreditWalletDetail> {
  return lire(cheminApi`/api/super-admin/credit-wallets/${agencyId}${new URLSearchParams({ page: String(page) })}`);
}

export function adjustCreditWallet(
  agencyId: number,
  body: { readonly amount: number; readonly reason: string },
): Promise<{ readonly data: { readonly balance: number; readonly lot: CreditLot | null } }> {
  return ecrire(cheminApi`/api/super-admin/credit-wallets/${agencyId}/adjustments`, 'POST', body);
}

export function fetchAdminBoosts(params: { readonly status?: BoostStatus | ''; readonly page?: number }): Promise<{ readonly data: readonly PropertyBoost[]; readonly meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('filter[status]', params.status);
  qs.set('page', String(params.page ?? 1));
  return lire(cheminApi`/api/super-admin/boosts${qs}`);
}

export function cancelBoost(id: number, body: { readonly refund: boolean; readonly reason: string }): Promise<{ readonly data: PropertyBoost }> {
  return ecrire(cheminApi`/api/super-admin/boosts/${id}/cancel`, 'POST', body);
}

export function offerBoost(propertyId: number, body: { readonly product_id: number; readonly reason: string }): Promise<{ readonly data: PropertyBoost }> {
  return ecrire(cheminApi`/api/super-admin/properties/${propertyId}/offered-boost`, 'POST', body);
}

export function fetchBoostStats(params: { readonly from: string; readonly to: string }): Promise<BoostStatsResponse> {
  return lire(cheminApi`/api/super-admin/boost-stats${new URLSearchParams(params)}`);
}
