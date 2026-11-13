'use client';

import { useTranslations } from 'next-intl';

import { useCan } from '@/hooks/useCan';
import { useDemandesAAttribuer, useVisitesAConfirmer } from '@/lib/queries/accueil';

/**
 * TCK-2624 — la ligne sous « Bonjour Awa » : « Mardi 10 novembre · 3 demandes non attribuées, 12
 * visites à confirmer ». Les comptes sont ceux des files de « À faire » (mêmes clés de cache, donc les
 * mêmes nombres, sans lecture de plus) ; un compte nul se tait, et tant qu'ils ne sont pas lus la
 * ligne dit la date seule.
 */
export function ResumeDuJour({ jour, agencyId }: { readonly jour: string; readonly agencyId: number }) {
  const t = useTranslations('accueil.admin.resume');
  const attribution = useCan('crm.assign', agencyId);
  const demandes = useDemandesAAttribuer(attribution.can).data?.meta.total ?? 0;
  const visites = useVisitesAConfirmer(true).data?.meta.total ?? 0;
  const parties = [demandes > 0 ? t('demandes', { n: demandes }) : null, visites > 0 ? t('visites', { n: visites }) : null].filter(Boolean);
  return parties.length > 0 ? t('ligne', { jour, resume: parties.join(t('separateur')) }) : jour;
}
