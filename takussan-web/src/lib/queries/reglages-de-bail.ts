'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import type { ApiResponse } from '@/types/api';

/**
 * TCK-2832 — les réglages de bail de l'agence (`GET /api/settings/lease`,
 * `App\Services\Lease\ReglagesDeBailDeLAgence`) : pour chaque clé, la valeur qu'un bail neuf reprend,
 * sa source, la valeur de la plateforme, la ligne d'agence et les bornes du catalogue.
 */
export const CLES_DES_REGLAGES_DE_BAIL = [
  'lease.late_fee_percent',
  'lease.late_fee_grace_days',
  'lease.early_termination_penalty_months',
  'lease.rent_review_max_pct',
] as const;

export type CleDeReglageDeBail = (typeof CLES_DES_REGLAGES_DE_BAIL)[number];

export type ReglageDeBail = {
  readonly key: CleDeReglageDeBail;
  readonly value: number;
  readonly source: 'agency' | 'platform';
  readonly platform_value: number;
  /** La ligne d'agence, que « revenir à la valeur de la plateforme » retire ; `null` : aucune. */
  readonly setting_id: number | null;
  readonly type: 'integer' | 'decimal';
  readonly min: number | null;
  /** `gt` au catalogue : le plancher lui-même n'est pas admis. */
  readonly min_exclusive: boolean;
  readonly max: number | null;
};

export type ReglagesDeBail = { readonly can_edit: boolean; readonly settings: readonly ReglageDeBail[] };

const CLE = ['settings', 'lease'] as const;
/** Les défauts du nouveau bail se relisent après chaque écriture (même onglet). */
const A_RELIRE = [[...CLE], ['leases', 'defaults']];

export function useReglagesDeBail() {
  return useApiQuery<ApiResponse<ReglagesDeBail>>([...CLE], cheminApi`/api/settings/lease`);
}

/** `POST /api/settings` en portée `agency` : la ligne se crée ou se remplace (`updateOrCreate`). */
export function useEnregistrerReglageDeBail() {
  return useApiMutation<unknown, { readonly key: CleDeReglageDeBail; readonly value: number }>(
    {
      path: cheminApi`/api/settings`,
      method: 'POST',
      body: (v) => ({ key: v.key, value: { value: v.value }, scope: 'agency' }),
    },
    { invalidate: A_RELIRE },
  );
}

/** « Revenir à la valeur de la plateforme » : la ligne d'agence est RETIRÉE, jamais remise à 0 (TCK-2643 r6). */
export function useRevenirALaPlateforme() {
  return useApiMutation<unknown, { readonly settingId: number }>(
    { path: (v) => cheminApi`/api/settings/${v.settingId}`, method: 'DELETE', body: () => undefined },
    { invalidate: A_RELIRE },
  );
}
