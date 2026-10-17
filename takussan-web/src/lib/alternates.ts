import type { Metadata } from 'next';

import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { LOCALES_INDEXABLES, cheminLocalise, estCheminLocalisable } from '@/i18n/routing';

import { origineSite } from './config-publique';

/**
 * L'origine du site se décide dans `config-publique.ts` (ADR-0069 § 3), lue à l'appel et non plus
 * figée à l'import. Réexportée ici pour ses importateurs historiques.
 */
export { ORIGINE_PRODUCTION, origineSite, resoudreOrigineSite, type SourcesOrigineSite } from './config-publique';

/**
 * Les `hreflang` d'une page publique — [ADR-0026](../../../docs/adr/0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ARGUMENT EST, ET CE QU'IL N'EST PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `chemin` est le chemin **SANS langue** : `/properties/mon-slug`, `/`, `/agencies/x`. Pas
 * `/fr/properties/mon-slug`. C'est le seul argument qui rende la fonction idempotente pour les
 * trois langues à la fois — `cheminLocalise` réécrit un préfixe existant, mais accepter les deux
 * formes reviendrait à laisser un appelant croire qu'il déclare `fr` alors qu'il déclare la langue
 * courante.
 *
 * ⚠️ **Les URL restent ABSOLUES, MÊME depuis que `metadataBase` est posé** (TCK-433, dans
 * `src/app/layout.tsx`) — mais **le motif écrit ici était faux, et il a été re-mesuré le
 * 2026-08-28.**
 *
 * Ce qu'il affirmait : « sans `metadataBase`, Next retombe sur `http://localhost:3000` et le
 * `hreflang` sort en pointant la machine du développeur ». **Faux pour les alternates.** Mesuré
 * avec le résolveur de Next (`next/dist/lib/metadata/resolvers/resolve-url.js`), dont la ligne
 * responsable est `const result = metadataBase ? resolveUrl(url, metadataBase) : url;` : **sans
 * `metadataBase`, un alternate relatif reste RELATIF.** Le repli `localhost` existe bien, mais il
 * n'est atteint que par `resolveUrl` — donc par les **images** `openGraph` / `twitter`, où
 * `src/app/layout.tsx` l'énonce d'ailleurs correctement.
 *
 * La règle ne change pas, sa justification si : un `hreflang` **relatif** dans un `<head>` est
 * résolu par le CLIENT contre l'URL du document. Il serait donc juste tant que le document est
 * servi sur la bonne origine, et faux partout ailleurs (une prévisualisation, un miroir, un cache
 * réécrit) — sans jamais rougir. Une URL absolue ne dépend d'aucun réglage qu'on puisse retirer
 * sans s'en apercevoir, et c'est ce qu'on veut ici.
 *
 * *Un motif faux dans un docblock qui porte une décision est pire qu'un docblock absent : c'est
 * lui qu'un futur lecteur croira.*
 *
 * `x-default` pointe vers le français. Il a une cible RÉELLE et distincte — c'est l'argument
 * principal du préfixe systématique d'ADR-0026 §1 : en `as-needed`, `x-default` et `hreflang="fr"`
 * auraient désigné la même URL, ce qui prive `x-default` de son sens.
 */
export function alternatesLangues(chemin: string): NonNullable<Metadata['alternates']> {
  if (!estCheminLocalisable(chemin)) {
    throw new Error(
      `alternatesLangues attend un chemin public sans langue, reçu « ${chemin} ». Les surfaces non ` +
        'localisées (console, /auth, /api…) n’ont pas de version par langue et ne déclarent pas de hreflang.',
    );
  }

  const languages: Record<string, string> = {};
  for (const locale of LOCALES_INDEXABLES) {
    languages[locale] = `${origineSite()}${cheminLocalise(chemin, locale)}`;
  }
  languages['x-default'] = `${origineSite()}${cheminLocalise(chemin, DEFAULT_LOCALE)}`;

  return { languages };
}


/**
 * Les `alternates` COMPLETS d'une page publique : la canonique **et** les `hreflang` — TCK-433.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LES DEUX NE SE DÉCLARENT PAS SÉPARÉMENT, ET C'EST TOUT L'INTÉRÊT DE CE POINT UNIQUE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Une canonique qui désigne une URL et des `hreflang` qui en désignent d'autres sont un signal
 * contradictoire : Google ignore alors le groupe entier. Les deux se dérivent donc ici du MÊME
 * chemin — le chemin **canonique**, pas celui que le visiteur a demandé. Sur
 * `/fr/properties?type=villa&page=3`, la canonique et les trois `hreflang` désignent tous
 * `…/properties?type=villa`, chacun dans sa langue.
 *
 * ⚠️ **La canonique porte le PRÉFIXE de langue de la page courante.** Depuis TCK-434 il n'existe
 * plus aucune URL publique sans préfixe : `/properties/x` rend 307. Une canonique non préfixée
 * désignerait donc une redirection comme version de référence.
 *
 * `chemin` accepte une chaîne de requête (`/properties?type=villa`) : `cheminLocalise` n'agit que
 * sur le premier segment, et `estCheminLocalisable` ne regarde l'extension que du dernier — un
 * `?` n'en est pas une. Verrouillé par les tests de ce module.
 */
export function alternatesPubliques(
  chemin: string,
  locale: Locale,
): NonNullable<Metadata['alternates']> {
  const { languages } = alternatesLangues(chemin);

  return {
    canonical: `${origineSite()}${cheminLocalise(chemin, locale)}`,
    languages,
  };
}
