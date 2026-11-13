'use client';

import { useTranslations } from 'next-intl';

import type { LoyersDuMois } from '@/lib/accueil/loyers-du-mois';
import { useVisitesAConfirmer } from '@/lib/queries/accueil';
import { useLoyersEnRetard } from '@/lib/queries/accueil-bailleur';
import { useDevisAttendantLeBailleur } from '@/lib/queries/maintenance-signalement';

/**
 * TCK-2624 (lot 2) — la ligne sous « Bonjour Mouhamed » : « Vendredi 13 novembre · 8 loyers reçus sur
 * 14, 2 visites à confirmer » au bureau, sans les loyers au téléphone (la carte des loyers est juste
 * dessous), et « · rien n'attend votre réponse » quand chaque file a répondu à zéro. Les comptes sont
 * ceux de « À faire » (mêmes clés de cache) ; tant qu'ils ne sont pas lus, la date seule.
 */
export function ResumeDuBailleur({ jour, landlordId, loyers }: { readonly jour: string; readonly landlordId: number; readonly loyers: LoyersDuMois | null }) {
  const t = useTranslations('accueil.bailleur.resume');
  const visites = useVisitesAConfirmer(true);
  const devis = useDevisAttendantLeBailleur();
  const retards = useLoyersEnRetard(landlordId, true);
  const nVisites = visites.data?.meta.total;
  const nDevis = devis.data?.meta.total;
  const nRetards = retards.data?.meta.total;
  const toutLu = nVisites !== undefined && nDevis !== undefined && nRetards !== undefined;

  if (toutLu && nVisites === 0 && nDevis === 0 && nRetards === 0) return t('rien', { jour });
  const partLoyers = loyers ? t('loyers', { recus: loyers.recus, attendus: loyers.attendus }) : null;
  const partVisites = nVisites ? t('visites', { n: nVisites }) : null;
  if (!partLoyers && !partVisites) return jour;
  return (
    <>
      {jour}
      {partLoyers ? (
        <span className="max-md:hidden">
          {t('separateurDate')}
          {partLoyers}
        </span>
      ) : null}
      {partVisites ? (
        <>
          <span className={partLoyers ? 'md:hidden' : undefined}>{t('separateurDate')}</span>
          {partLoyers ? <span className="max-md:hidden">{t('separateur')}</span> : null}
          {partVisites}
        </>
      ) : null}
    </>
  );
}
