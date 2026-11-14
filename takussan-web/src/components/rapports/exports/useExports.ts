'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useApiQuery } from '@/hooks/useApiQuery';
import { useCan } from '@/hooks/useCan';
import { buildExportUrl, type ExportEntity, type ExportOptions } from '@/lib/queries/exports';
import { exportsPermis } from '@/lib/rapports/exports';

/** Les types que ce compte peut exporter aujourd'hui (`exportsPermis`), lus des capacités du profil actif. */
export function useExportsPermis(staff: boolean): ExportEntity[] {
  const tenues: Record<string, boolean> = {
    'payments.export': useCan('payments.export').can,
    'reports.export': useCan('reports.export').can,
    'crm.export': useCan('crm.export').can,
  };
  return exportsPermis(staff, tenues);
}

/** TCK-2627 — une ligne de `GET /api/me/exports` : relue du journal, jamais un fichier gardé. */
export interface ExportJournalise {
  readonly at: string | null;
  readonly entity: string | null;
  readonly format: string | null;
  readonly filters: { readonly from: string | null; readonly to: string | null };
  readonly row_count: number;
}

export const DERNIERS_EXPORTS_CLE = ['me', 'exports'] as const;

export function useDerniersExports() {
  return useApiQuery<{ data: ExportJournalise[] }>(DERNIERS_EXPORTS_CLE, '/api/me/exports', {
    params: { extra: { limit: 10 } },
    staleTime: 0,
  });
}

export interface EtatDuTelechargement {
  /** L'identifiant de ce qui télécharge (une carte, le formulaire, une ligne à refaire), ou `null`. */
  readonly enCours: string | null;
  /** Le nombre de lignes quand l'API a coupé au plafond (`X-Export-Truncated`). */
  readonly coupe: number | null;
  readonly echec: boolean;
  /** L'identifiant de la dernière demande : la carte ou la ligne sous laquelle dire la coupure ou l'échec. */
  readonly dernier: string | null;
}

/**
 * TCK-1308 (P112.03), sorti de `ExportForm` par TCK-2629 pour servir aussi les cartes prêtes et « Refaire » :
 * le téléchargement passe par le relais en `fetch` — seule façon de lire `X-Export-Truncated` — et le nom
 * du fichier est celui que l'API rend (`Content-Disposition`). Après un téléchargement, « Derniers
 * exports » est relu : la ligne que l'API vient de journaliser y apparaît en tête.
 */
export function useTelechargement() {
  const queryClient = useQueryClient();
  const [etat, setEtat] = useState<EtatDuTelechargement>({ enCours: null, coupe: null, echec: false, dernier: null });

  async function telecharger(id: string, options: ExportOptions) {
    setEtat({ enCours: id, coupe: null, echec: false, dernier: id });
    try {
      const res = await fetch(buildExportUrl(options));
      if (!res.ok) {
        setEtat({ enCours: null, coupe: null, echec: true, dernier: id });
        return;
      }
      const tronque = Number(res.headers.get('x-export-truncated'));
      const nom =
        /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `${options.entity}.${options.format}`;
      const objectUrl = URL.createObjectURL(await res.blob());
      const lien = document.createElement('a');
      lien.href = objectUrl;
      lien.download = nom;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(objectUrl);
      setEtat({ enCours: null, coupe: Number.isFinite(tronque) && tronque > 0 ? tronque : null, echec: false, dernier: id });
      void queryClient.invalidateQueries({ queryKey: DERNIERS_EXPORTS_CLE });
    } catch {
      setEtat({ enCours: null, coupe: null, echec: true, dernier: id });
    }
  }

  return { ...etat, telecharger };
}

export type Telechargement = ReturnType<typeof useTelechargement>;
