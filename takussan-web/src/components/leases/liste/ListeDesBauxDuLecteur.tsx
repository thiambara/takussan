'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';

import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { useBauxDuLecteur } from '@/lib/queries/leases-file';
import type { LeaseStatus } from '@/types/lease';

import { useLectureDuBail } from './lecture';
import { LigneDuBail, TableDesBaux } from './PiecesDesBaux';

/**
 * TCK-2644 — les baux du bailleur, et ceux d'un locataire qui en a plusieurs (un seul : la page le
 * mène sur sa fiche). Une liste simple qui NOMME le locataire : ni file « À traiter », ni geste
 * d'agence, ni filtre d'agence. `?status=` reste lu (« Baux à signer » de l'aperçu y mène).
 */
export function ListeDesBauxDuLecteur({ statut, peutCreer, nouveauBail }: { readonly statut: LeaseStatus | null; readonly peutCreer: boolean; readonly nouveauBail?: React.ReactNode }) {
  const t = useTranslations('lease.liste');
  const tListe = useTranslations('lease.list');
  const tCommon = useTranslations('common');
  const [maintenant] = useState(() => new Date());
  const lecture = useLectureDuBail(maintenant);
  const [page, setPage] = useState(1);
  const lu = useBauxDuLecteur(page, statut);
  const baux = lu.data?.data ?? [];

  if (lu.isPending) {
    return (
      <div className="space-y-3 px-4 pt-2 md:px-0" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }
  if (lu.isError) {
    return (
      <div className="px-4 md:px-0">
        <ErrorState message={t('erreur')} onRetry={() => void lu.refetch()} retryLabel={tCommon('actions.retry')} />
      </div>
    );
  }
  if (baux.length === 0) {
    return (
      <div className="px-4 md:px-0">
        <EmptyState
          icon={<FileText className="size-8" aria-hidden="true" />}
          title={statut ? tListe('empty_filtered_title') : tListe('empty_title')}
          description={statut ? tListe('empty_filtered_description') : peutCreer ? tListe('empty_description') : undefined}
          action={!statut && peutCreer ? nouveauBail : undefined}
        />
      </div>
    );
  }
  const pagination = lu.data?.meta ? <Pagination page={lu.data.meta.current_page} lastPage={lu.data.meta.last_page} onChange={setPage} /> : null;
  return (
    <div data-slot="baux-du-lecteur">
      <ul aria-label={t('caption')} className="space-y-3 px-4 md:px-0 lg:hidden">
        {baux.map((bail) => (
          <LigneDuBail key={bail.id} bail={bail} lecture={lecture} />
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card lg:block">
        <TableDesBaux baux={baux} lecture={lecture} />
      </div>
      <div className="px-4 pt-3 md:px-0">{pagination}</div>
    </div>
  );
}
