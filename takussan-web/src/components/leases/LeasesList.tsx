'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import type { LeaseStatus } from '@/types/lease';

import { ListeDesBauxDeLAgence } from './liste/ListeDesBauxDeLAgence';
import { ListeDesBauxDuLecteur } from './liste/ListeDesBauxDuLecteur';

/** Les libellés vivent sous `lease.status.*` ; l'ordre, lui, reste du code. */
const STATUTS: readonly LeaseStatus[] = ['draft', 'pending_signature', 'active', 'terminating', 'expired', 'terminated', 'renewed'];

function statutDeLUrl(valeur: string | null): LeaseStatus | null {
  return valeur !== null && (STATUTS as readonly string[]).includes(valeur) ? (valeur as LeaseStatus) : null;
}

/**
 * TCK-2644 — la liste des baux, selon qui la lit :
 *
 *  · le PERSONNEL de l'agence : la file « À traiter », ses onglets comptés et ses gestes
 *    ({@link ListeDesBauxDeLAgence}) ;
 *  · le bailleur, et le locataire qui a plusieurs baux : une liste simple qui nomme le locataire,
 *    sans file ni geste ni filtre d'agence ({@link ListeDesBauxDuLecteur}). Le locataire qui n'a qu'un
 *    bail n'arrive pas ici : `(liste)/layout.tsx` le mène sur sa fiche.
 *
 * TCK-1513 (P167.03) — `?status=` reste lu des deux côtés : « Baux à signer » de l'aperçu de l'agent
 * mène à `?status=pending_signature`. Une valeur hors des statuts est ignorée.
 */
export function LeasesList({
  vue,
  peutCreer,
  agencyId = null,
}: {
  readonly vue: 'agence' | 'bailleur' | 'locataire';
  readonly peutCreer: boolean;
  readonly agencyId?: number | null;
}) {
  const t = useTranslations('lease.liste');
  const statut = statutDeLUrl(useSearchParams().get('status'));
  if (vue === 'agence') return <ListeDesBauxDeLAgence peutCreer={peutCreer} agencyId={agencyId} />;
  const nouveauBail = peutCreer ? (
    <Link href="/app/leases/new" className={buttonVariants()}>
      <Plus className="size-4" aria-hidden="true" />
      {t('nouveauBail')}
    </Link>
  ) : undefined;
  return <ListeDesBauxDuLecteur statut={statut} peutCreer={peutCreer} nouveauBail={nouveauBail} />;
}
