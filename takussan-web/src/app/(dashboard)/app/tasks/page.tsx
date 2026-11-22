import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { PageDesTaches } from '@/components/taches/PageDesTaches';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { isAdmin } from '@/lib/roles';
import { getToken } from '@/lib/session';
import { lirePour } from '@/lib/taches/lien-nouvelle-tache';
import { rattachementDeLaFiche } from '@/lib/taches/rattachement-de-la-fiche';
import { lireEtat } from '@/lib/taches/taches';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('taches');
  return { title: t('titre') };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * TCK-2596 (lot 2) — « Tâches ». L'URL garde son contrat (TCK-591, TCK-1733) : `?filter[due]=today`
 * et `?filter[assigned_to]=me` (la tuile « Tâches du jour ») ouvrent la liste comme avant ; sans
 * échéance, elle s'ouvre sur En retard + Aujourd'hui. `?nouvelle=1` ouvre « Nouvelle tâche ». Le
 * filtre d'équipe n'est offert qu'au lecteur de l'agence (`crm.view_all`, que `filter[team]=1` exige).
 * TCK-2857 — `?grouper=rattachement&rattachement=clients|biens` (bureau) ; `?nouvelle=1&pour=customer:12`
 * (« Nouvelle tâche » d'une fiche) ouvre le formulaire, « Rattachée à » prérempli du libellé relu ici.
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const user = await getMeAction();
  const admin = isAdmin(user.roles);
  const capacites = admin ? await capacitesDuProfilActif().catch(() => null) : null;
  const ouvrirNouvelle = params.nouvelle === '1';
  const pour = ouvrirNouvelle ? lirePour(params.pour) : null;
  const token = pour ? await getToken() : null;
  const rattachement = pour && token ? await rattachementDeLaFiche(token, pour) : null;

  return (
    <PageDesTaches
      etatInitial={lireEtat(params)}
      ouvrirNouvelle={ouvrirNouvelle}
      equipeVisible={(capacites ?? []).includes('crm.view_all')}
      rattachement={rattachement}
    />
  );
}
