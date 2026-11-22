'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ErreurDeBloc } from '@/components/accueil/EtatsDeBloc';

/**
 * TCK-2625 — `/dashboard/me` en panne chez le locataire : « Ce qui m'attend » et ses documents ne se lisent
 * pas. « Ce mois » le disait avant ; le locataire n'en a plus, ce bloc le dit à sa place, avec « Réessayer »
 * (la page est lue par le serveur : on la relit).
 */
export function ErreurDeLaSituation({ className }: { readonly className?: string }) {
  const t = useTranslations('accueil.blocs');
  const router = useRouter();
  return <ErreurDeBloc quoi={t('quoi.aFaire')} onReessayer={() => router.refresh()} className={className} />;
}
