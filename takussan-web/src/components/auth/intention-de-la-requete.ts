import { getLocale } from 'next-intl/server';

import { bienQuitte } from '@/lib/queries/bien-quitte';

import type { IntentionAffichee } from './IntentionDEntree';
import { debutDuGesteQuitte, lireActionDEntree, slugDuBienQuitte } from './lien-connexion';

/**
 * TCK-2606 — ce que la page de connexion lit de sa requête (TCK-2604), lu de la même façon par
 * l'oubli et la vérification de l'adresse : l'action (liste fermée) et le bien quitté, par la
 * lecture PARTAGÉE de la fiche (`bienQuitte`). Composants serveur seulement.
 */
export type RechercheDeLaPage = Promise<Record<string, string | string[] | undefined>>;

export function une(valeur: string | string[] | undefined): string | null {
  return typeof valeur === 'string' ? valeur : null;
}

export async function intentionDeLaRequete(params: Awaited<RechercheDeLaPage>): Promise<IntentionAffichee | null> {
  const action = lireActionDEntree(une(params.intention));
  if (!action) return null;
  const redirect = une(params.redirect);
  const slug = slugDuBienQuitte(redirect);
  const bien = slug ? await bienQuitte(slug, await getLocale()) : null;
  return { action, bien, dates: bien ? debutDuGesteQuitte(redirect) : null };
}
