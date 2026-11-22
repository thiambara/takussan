'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useApiQuery } from '@/hooks/useApiQuery';
import { useCan } from '@/hooks/useCan';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cheminApi } from '@/lib/chemin-api';
import { buildExportUrl, type ExportEntity, type ExportFormat, type ExportOptions } from '@/lib/queries/exports';
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

/**
 * TCK-2627 — une ligne de `GET /api/me/exports`, relue du journal. TCK-2868 — `id` et `file` (TCK-2866,
 * ADR-0115) : le fichier est gardé quelques jours à son auteur, et `file.available` dit s'il l'est encore.
 */
export interface ExportJournalise {
  readonly id?: number;
  readonly file?: { readonly available: boolean; readonly expires_at: string | null } | null;
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
        // Avec ou sans guillemets : l'API rend `filename=…` nu en Excel (relevé du 2026-11-14).
        /filename="?([^";\n]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `${options.entity}.${options.format}`;
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

/**
 * TCK-2868 — combien de lignes l'export demandé compterait (`GET /api/export/{entity}/count` → `{count, limit}`,
 * TCK-2866 : la requête même du fichier), relu quand le type, le format ou la période change — après un
 * anti-rebond, pour ne pas lire à chaque frappe d'une date. `limit` est le plafond du FORMAT (200 en PDF).
 *
 * Direct à l'API (`useApiQuery`) : le relais `/api/export/[entity]` de Next ne sert que les fichiers.
 */
export function useCompteDeLExport(options: { readonly entity: ExportEntity; readonly format: ExportFormat; readonly from: string; readonly to: string }) {
  // Une chaîne, pas l'objet : un objet neuf à chaque rendu relancerait l'anti-rebond sans fin.
  const courante = [options.entity, options.format, options.from, options.to].join('|');
  const demandee = useDebouncedValue(courante, 400);
  const [entity, format, from, to] = demandee.split('|') as [ExportEntity, ExportFormat, string, string];
  const params = { format, from: from || undefined, to: to || undefined };
  const lecture = useApiQuery<{ data: { count: number; limit: number } }>(
    ['export', 'count', entity, params],
    cheminApi`/api/export/${entity}/count`,
    { params: { extra: params }, staleTime: 30_000 },
  );
  // Une lecture qui ne répond pas à la demande COURANTE (frappe en cours) ne dit rien : rien ne bloque sur elle.
  const lu = lecture.data?.data;
  return demandee === courante && lu && typeof lu.count === 'number' && typeof lu.limit === 'number' ? lu : null;
}

/** TCK-2868 — l'issue d'un « Retélécharger » : `expire` (410, ou 403 : l'auteur ne pourrait plus le refaire). */
export type IssueDuRetelechargement = 'expire' | 'echec';

/**
 * TCK-2868 — « Retélécharger » un export conservé : `GET /api/me/exports/{id}/download` (TCK-2866), à son
 * seul auteur, par le relais du BFF (`app/api/me/exports/[id]/download`) comme les autres exports : le nom
 * du fichier est celui de l'API (`Content-Disposition`), `nomDeRepli` sinon. Un 410 (échéance passée) ou un
 * 403 (plus le droit de le refaire) relit la liste : la ligne passe à « Refaire » ou disparaît.
 */
export function useRetelechargement() {
  const queryClient = useQueryClient();
  const [etat, setEtat] = useState<{ readonly enCours: number | null; readonly issue: { readonly id: number; readonly quoi: IssueDuRetelechargement } | null }>({
    enCours: null,
    issue: null,
  });

  async function retelecharger(id: number, nomDeRepli: string) {
    setEtat({ enCours: id, issue: null });
    try {
      const res = await fetch(cheminApi`/api/me/exports/${id}/download`);
      if (!res.ok) {
        const quoi: IssueDuRetelechargement = res.status === 410 || res.status === 403 ? 'expire' : 'echec';
        setEtat({ enCours: null, issue: { id, quoi } });
        if (quoi === 'expire') void queryClient.invalidateQueries({ queryKey: DERNIERS_EXPORTS_CLE });
        return;
      }
      const nom = /filename="?([^";\n]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? nomDeRepli;
      const objectUrl = URL.createObjectURL(await res.blob());
      const lien = document.createElement('a');
      lien.href = objectUrl;
      lien.download = nom;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(objectUrl);
      setEtat({ enCours: null, issue: null });
    } catch {
      setEtat({ enCours: null, issue: { id, quoi: 'echec' } });
    }
  }

  return { ...etat, retelecharger };
}

export type Retelechargement = ReturnType<typeof useRetelechargement>;
