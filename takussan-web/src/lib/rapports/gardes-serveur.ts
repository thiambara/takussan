import { redirect } from 'next/navigation';

import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { ROUTE_VERIF_INDISPONIBLE, resolveAgencyOrNull } from '@/lib/access/server-guards';
import { repliDeLaVueBailleur, vueBailleurOuverte } from '@/lib/access/tableau-du-bailleur';
import {
  ONGLETS_DES_RAPPORTS,
  PAGE_D_ORIGINE_DE_L_ONGLET,
  cibleDeLAncienneAdresse,
  indicateursDeLaPersona,
  ongletDeLaPersona,
  rapportsOuverts,
  type AncienneAdresse,
  type IdOnglet,
} from '@/lib/navigation/rapports';
import { getToken } from '@/lib/session';

import { lireLeContexteDesRapports, type ContexteServeurDesRapports } from './contexte-serveur';

/**
 * TCK-2628 — les gardes de « Rapports ». Chaque onglet garde la garde de la page qu'il remplace (contrainte
 * du ticket), et chacune s'appelle depuis un LAYOUT : sous le `loading.tsx` d'un onglet, un `redirect()`
 * de page rendrait 200 et le squelette de l'écran refusé (TCK-426, `overview/agency/layout.tsx`).
 *
 * Un refus mène où l'on peut aller : la vue d'ensemble pour un onglet absent de la persona, `/app` pour
 * une persona sans « Rapports » ; une page d'origine refusée garde le repli de `garderPageAdmin`.
 *
 * ⚠ Aucune garde ne lit le masque des modules (`modulesMasquesDe`) : il retire un onglet de la BARRE, pas
 * l'accès à son adresse (amendement du 2026-11-10 d'ADR-0089, § 3 ; `modules.test.ts`). Seule la
 * redirection d'une ANCIENNE adresse le lit, pour mener à la vue d'ensemble plutôt qu'à un onglet caché.
 */
const ENSEMBLE = ONGLETS_DES_RAPPORTS.ensemble.href;

/** La section entière : une persona sans « Rapports » (locataire, client, prestataire) va à `/app`. */
export async function garderLesRapports(): Promise<ContexteServeurDesRapports> {
  const contexte = await lireLeContexteDesRapports();
  if (!rapportsOuverts(contexte)) redirect('/app');
  return contexte;
}

/**
 * La vue d'ensemble, par persona — les gardes des vues qu'elle remplace, à l'identique :
 *
 *  · admin d'agence et super-admin : `overview/agency/layout.tsx` — agence `standard`, lue en
 *    `'decision'` (le `kind` GARDE l'accès : on refuse quand on ne sait pas) ; un super-admin sans
 *    agence passe, la vue lui dit qu'il n'en a pas ;
 *  · bailleur et hôte : `overview/owner/layout.tsx` — `vueBailleurOuverte` (TCK-2260) ;
 *  · agent : `overview/agent/layout.tsx` — le rôle, que la persona porte déjà.
 */
export async function garderLaVueDEnsemble(): Promise<ContexteServeurDesRapports> {
  const contexte = await garderLesRapports();
  const { persona, user } = contexte;
  if (persona === 'admin-agence' || persona === 'plateforme') {
    if (user.agency_id) {
      const token = await getToken();
      const agence = token ? await resolveAgencyOrNull(token, user.agency_id, 'reports (ensemble)', 'decision') : null;
      if (!agence || agence.kind !== 'standard') redirect('/app');
    }
  } else if (persona === 'bailleur' || persona === 'hote') {
    await garderLaVueBailleur(contexte);
  }
  return contexte;
}

async function garderLaVueBailleur({ user }: ContexteServeurDesRapports): Promise<void> {
  const ouverte = await vueBailleurOuverte(user);
  if (ouverte === null) redirect(ROUTE_VERIF_INDISPONIBLE);
  if (!ouverte) redirect(await repliDeLaVueBailleur(user));
}

/**
 * Un onglet : dans la table de la persona (sinon la vue d'ensemble), puis la garde de sa page d'origine
 * en `'decision'` (Équipe, Impayés) et la capacité sans laquelle sa page ne l'offre pas. Reversements lit
 * la vue du bailleur : sa garde.
 */
export async function garderLOnglet(id: Exclude<IdOnglet, 'ensemble'>): Promise<ContexteServeurDesRapports> {
  const contexte = await garderLesRapports();
  if (!ongletDeLaPersona(id, contexte.persona)) redirect(ENSEMBLE);
  const origine = PAGE_D_ORIGINE_DE_L_ONGLET[id];
  if (origine) {
    await garderPageAdmin(origine.chemin);
    if (origine.capacite !== undefined) {
      if (contexte.capacites === null) redirect(ROUTE_VERIF_INDISPONIBLE);
      if (!contexte.capacites.includes(origine.capacite)) redirect(ENSEMBLE);
    }
  }
  if (id === 'reversements') await garderLaVueBailleur(contexte);
  return contexte;
}

/** « Indicateurs » (`KpiConfigList`) : celle de l'ancien `overview/kpis/layout.tsx` — l'admin, agence `individual` comprise. */
export async function garderLesIndicateurs(): Promise<ContexteServeurDesRapports> {
  const contexte = await garderLesRapports();
  if (!indicateursDeLaPersona(contexte.persona)) redirect(ENSEMBLE);
  return contexte;
}

/**
 * Les sept anciennes adresses (ADR-0096 § 4) : l'onglet équivalent, avec la portée. La page appelle
 * `redirect()` elle-même sur la cible rendue : c'est la forme que `etats-de-route.test.ts` reconnaît comme
 * une redirection nue (aucune frontière de suspension au-dessus, donc un 307).
 */
export async function cibleServeurDeLAncienneAdresse(
  adresse: AncienneAdresse,
  parametres?: Promise<{ readonly scope?: string | string[] }>,
): Promise<string> {
  const [contexte, lus] = await Promise.all([lireLeContexteDesRapports(), parametres ?? Promise.resolve({})]);
  return cibleDeLAncienneAdresse(adresse, contexte, lus);
}
