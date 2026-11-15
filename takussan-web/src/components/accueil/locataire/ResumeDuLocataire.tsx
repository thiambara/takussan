'use client';

import { useTranslations } from 'next-intl';

import { aujourdHuiADakar } from '@/components/payments/locataire/resume';
import { carteDuLoyer } from '@/lib/accueil/carte-du-loyer';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useResumeDuLoyer } from '@/lib/queries/payments';

/**
 * TCK-2625 — la ligne sous le salut du locataire (maquette : « Mardi 10 novembre · prochain loyer le
 * 5 décembre ») : ce que la carte « Loyer » dit, en une phrase. Le jour seul tant que le résumé n'est
 * pas lu, en échec, ou sans bail.
 */
export function ResumeDuLocataire({ jour }: { readonly jour: string }) {
  const t = useTranslations('accueil.locataire');
  const f = useFormatteurs();
  const resume = useResumeDuLoyer();
  const carte = carteDuLoyer(resume.data?.data, aujourdHuiADakar());
  if (carte?.genre === 'du') return <>{t('resume.du', { jour, montant: f.montantCourt(carte.total, carte.devise) })}</>;
  if (carte?.genre === 'aJour' && carte.prochain) {
    return <>{t('resume.prochain', { jour, date: f.date(carte.prochain.due_date, { day: 'numeric', month: 'long', dateStyle: undefined }) })}</>;
  }
  return <>{jour}</>;
}
