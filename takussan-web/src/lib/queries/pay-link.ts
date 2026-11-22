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
  /** TCK-2504 — l'instant du règlement (payée ou remboursée), ISO-8601 ; `null` tant que rien n'est réglé. */
  readonly paid_at: string | null;
  /**
   * TCK-2504 — comment payer HORS LIGNE. Émis par le serveur tant que quelque chose reste dû (loyer
   * ou pénalité), jamais sur une échéance remboursée ou annulée : l'écran l'affiche dès qu'il n'est
   * pas `null`, sans recalculer. Les clés nulles sont omises.
   */
  readonly offline_payment: PayLinkOfflinePayment | null;
  /**
   * TCK-2778 — ce que le lien fait payer : le loyer (`rent`, défaut d'un lien antérieur), ou la
   * pénalité de retard SEULE restée due sur un loyer payé (`late_fee`). Pour un lien `late_fee`,
   * `status` et `paid_at` décrivent le LOYER (payé) ; `amount_due` et `providers` sont ceux de la
   * pénalité, et `late_fee_paid_at` dit qu'elle est réglée.
   */
  readonly subject?: 'rent' | 'late_fee';
  /** TCK-2778 — l'instant du règlement de la pénalité de retard, ISO-8601 ; `null` tant qu'elle est due. */
  readonly late_fee_paid_at?: string | null;
}

/** TCK-2504 — les moyens hors ligne déclarés par l'agence. `agency_whatsapp` n'est jamais rendu (aucune source). */
export interface PayLinkOfflinePayment {
  readonly wave_number?: string;
  readonly orange_money_number?: string;
  readonly bank_details?: string;
  readonly agency_phone?: string;
}

export interface PayLinkVerification {
  readonly status: string | null;
  /** TCK-2778 — l'issue d'un lien `late_fee` se lit dans `late_fee_paid_at` : `status` décrit le loyer. */
  readonly subject?: 'rent' | 'late_fee';
  readonly amount_due: number;
  readonly late_fee_paid_at?: string | null;
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
