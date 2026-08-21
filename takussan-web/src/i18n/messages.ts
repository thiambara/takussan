import { getMessages } from 'next-intl/server';

import table from './namespaces.json';

/**
 * Le sous-ensemble du dictionnaire servi à une FRONTIÈRE de rendu (TCK-337).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE MODULE CORRIGE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `src/app/layout.tsx` passait `await getMessages()` — le dictionnaire ENTIER, 60 espaces de noms —
 * au provider client. Ce n'est pas du JS de bundle : c'est de la donnée sérialisée dans la charge
 * RSC du DOCUMENT, servie `no-store`, donc **repayée à chaque chargement de page**. Mesuré le
 * 2026-08-21 sur `/properties` : 76 182 o gzip servis, dont 63 039 o pour le seul dictionnaire —
 * **83,1 %**. Sur l'accueil, 87,8 %. Une page qui affiche une liste de biens faisait télécharger
 * la traduction du back-office super-admin.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA TABLE EST DÉRIVÉE ET NON ÉCRITE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `namespaces.json` est **généré** par `scripts/check-i18n-namespaces.mjs`, qui marche le graphe
 * d'imports depuis les fichiers du routeur. Il ne s'édite pas à la main, pour la raison que ce
 * dépôt a déjà payée trois fois (`INDEX.md`, `models-spec.md`, les gardes de `CLAUDE.md`) :
 * *une liste écrite à la main est juste le jour où on l'écrit*. Ici la sanction d'une table périmée
 * n'est pas un document faux — c'est un chemin de clé peint à l'écran d'un utilisateur.
 *
 * Chaque entrée porte l'ensemble **CUMULÉ** (la frontière plus tous ses parents). C'est délibéré :
 * les providers next-intl imbriqués REMPLACENT le dictionnaire du parent au lieu de le compléter
 * (cf. `IntlProvider.tsx`), et une union à écrire au point d'appel est une union à oublier.
 */
export type Frontiere = keyof typeof table.frontieres;

export async function messagesPour(frontiere: Frontiere): Promise<Record<string, unknown>> {
  const complet = (await getMessages()) as Record<string, unknown>;
  const sousEnsemble: Record<string, unknown> = {};
  for (const nom of table.frontieres[frontiere] as readonly string[]) {
    if (nom in complet) sousEnsemble[nom] = complet[nom];
  }
  return sousEnsemble;
}

/**
 * Les espaces de noms qu'AUCUN scan de site d'appel ne peut voir, et qui sont donc ajoutés à
 * toutes les frontières sans exception. Ils sont deux, et chacun a une raison mesurée :
 *
 * · `validation` — les schémas zod portent une CLÉ, jamais un libellé
 *   (`src/lib/schemas/messages.ts`), fabriquée par concaténation depuis
 *   `PREFIXE_VALIDATION = 'validation.'`. Aucun `t('validation.…')` littéral n'existe au point de
 *   rendu : la clé est une DONNÉE qui traverse react-hook-form.
 * · `errors` — même forme pour les erreurs réseau, dont les clés viennent de la table
 *   `CLE_I18N_ERREUR_API` de `src/lib/api.ts` et sont résolues par un traducteur à la racine.
 *
 * Codé en dur ici et vérifié par la garde : c'est le seul angle mort du dérivateur, et il vaut
 * mieux qu'il soit court, nommé et commenté qu'implicite.
 */
export const PLANCHER: readonly string[] = table.plancher;
