'use client';

import { useAuth } from '@/context/AuthContext';
import { useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';

/**
 * P133.01 (TCK-1375) — les réglages de facturation de l'agence de l'émetteur, que le dialogue de
 * facture pré-remplit : l'API applique les mêmes quand la clé manque (`InvoiceService::create`,
 * `agencies.default_tax_rate`), et le dialogue envoie désormais toujours la valeur affichée.
 *
 * `GET /api/agencies/{id}` rend la ressource entière (un `show` ignore `fields`, P60.03). Sans
 * agence (opérateur de la plateforme), ou tant que la requête n'a pas répondu, `ready` vaut
 * `false` et le dialogue garde ses valeurs initiales.
 */
export interface AgencyInvoiceDefaults {
  /** `agencies.default_tax_rate` ; `null` quand l'agence n'en a pas (l'API compte alors 0). */
  readonly taxRate: number | null;
  readonly ready: boolean;
}

interface AgencyInvoiceEnvelope {
  data: {
    id: number;
    default_tax_rate?: number | null;
  };
}

export function useAgencyInvoiceDefaults(): AgencyInvoiceDefaults {
  const { user } = useAuth();
  const agencyId = user?.agency_id ?? null;
  const enabled = typeof agencyId === 'number' && agencyId > 0;

  const query = useApiQuery<AgencyInvoiceEnvelope>(
    ['agency-invoice-defaults', agencyId ?? 'none'],
    cheminApi`/api/agencies/${agencyId ?? 0}`,
    { enabled, staleTime: 5 * 60 * 1000, retry: false },
  );

  const data = query.data?.data;
  const rate = data?.default_tax_rate;

  return {
    taxRate: typeof rate === 'number' && Number.isFinite(rate) ? rate : null,
    ready: enabled && data !== undefined,
  };
}
