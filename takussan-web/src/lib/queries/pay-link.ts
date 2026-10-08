import { ApiError, apiFetch, urlApiPublique } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-602 (ADR-0051 §1) — le lien de paiement d'une échéance, côté locataire SANS COMPTE.
 *
 * Le jeton EST le droit d'accès : il ne voyage que dans le chemin, par `cheminApi` (TCK-600), et la page
 * qui le porte sert `no-referrer`. Aucune session : ces appels n'en ont pas besoin, et l'API ne
 * rend que l'échéance — ni le nom ni le téléphone du locataire, ni d'identifiant interne.
 *
 * Les trois montants sont ceux de `LeasePaymentResource` (TCK-593), lus tels quels : la page ne
 * les recompose JAMAIS (`amount_due` inclut déjà la pénalité quand l'agence l'encaisse en ligne).
 */
export type PayLinkProvider = 'wave' | 'orange_money' | 'lemon_squeezy' | 'free_money';

export interface PayLink {
  readonly reference: string | null;
  readonly status: string | null;
  readonly currency: string | null;
  readonly amount_due: number;
  readonly late_fee_outstanding: number;
  readonly late_fee_payable_online: boolean;
  readonly period_start: string | null;
  readonly period_end: string | null;
  readonly due_date: string | null;
  readonly property: { readonly title: string | null; readonly neighborhood: string | null };
  readonly agency: { readonly name: string | null };
  readonly providers: readonly PayLinkProvider[];
  readonly receipt_available: boolean;
  readonly expires_at: string | null;
}

export interface PayLinkVerification {
  readonly status: string | null;
  readonly amount_due: number;
  readonly receipt_available: boolean;
}

export async function fetchPayLink(token: string): Promise<PayLink> {
  const res = await apiFetch<{ data: PayLink }>(cheminApi`/pay/${token}`);
  return res.data;
}

/** Ouvre le paiement chez le fournisseur ; l'URL de retour est fixée par le serveur. */
export async function initiatePayLink(
  token: string,
  provider: PayLinkProvider,
): Promise<{ checkout_url: string }> {
  const res = await apiFetch<{ data: { checkout_url: string } }>(cheminApi`/pay/${token}/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  return res.data;
}

/** Au retour du fournisseur : relit l'état chez lui (le webhook a pu se perdre). */
export async function verifyPayLink(token: string): Promise<PayLinkVerification> {
  const res = await apiFetch<{ data: PayLinkVerification }>(cheminApi`/pay/${token}/verify`, {
    method: 'POST',
  });
  return res.data;
}

/** La quittance PDF d'une échéance payée. */
export async function downloadPayLinkReceipt(token: string): Promise<Blob> {
  const res = await fetch(urlApiPublique(cheminApi`/pay/${token}/receipt`), { method: 'GET' });
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => null));
  }
  return res.blob();
}
