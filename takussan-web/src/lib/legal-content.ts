import type { Locale } from '@/i18n/config';
import type { DocumentLegal } from '@/lib/legal-routes';
import * as notice from '@/content/legal/notice';
import * as privacy from '@/content/legal/privacy';
import * as terms from '@/content/legal/terms';

/**
 * Ce qu'une page juridique affiche, décidé en un point — TCK-531, `docs/features.md` §2.10.
 *
 * ⚠ Les textes sont des MODULES TypeScript et non des fichiers `.md` lus par `fs`, et c'est une
 * contrainte de déploiement : l'image du front est un `output: 'standalone'` (ADR-0028) qui
 * n'embarque que ce que le graphe d'imports atteint. Un fichier lu au rendu par un chemin calculé
 * aurait été servi par `next dev` et absent de l'image — une page « à fournir » en production
 * alors que le texte est dans le dépôt.
 */
export type ContenuLegal =
  | { readonly etat: 'a-fournir' }
  | {
      readonly etat: 'publie';
      readonly texte: string;
      /** La langue du texte RENDU — `fr` quand la traduction demandée manque. */
      readonly langue: Locale;
      /**
       * `traduction` : le texte est une traduction de courtoisie, le français fait foi.
       * `francais-seul` : la traduction demandée n'existe pas, le français est rendu à la place.
       * `null` : le texte rendu est l'original français, demandé en français.
       */
      readonly mention: 'traduction' | 'francais-seul' | null;
    };

export type SourcesLegales = Readonly<Record<DocumentLegal, Readonly<Record<Locale, string>>>>;

const SOURCES: SourcesLegales = { terms, privacy, notice };

/**
 * Le contenu du document `document` pour la langue `locale`.
 *
 * Le français est la condition de publication : sans lui, rien n'est publié, même si une
 * traduction existe — une traduction de courtoisie sans texte faisant foi ne dit rien de valable.
 */
export function contenuLegal(
  document: DocumentLegal,
  locale: Locale,
  sources: SourcesLegales = SOURCES,
): ContenuLegal {
  const original = sources[document].fr.trim();
  if (original === '') return { etat: 'a-fournir' };
  if (locale === 'fr') return { etat: 'publie', texte: original, langue: 'fr', mention: null };

  const traduction = sources[document][locale].trim();
  if (traduction === '') {
    return { etat: 'publie', texte: original, langue: 'fr', mention: 'francais-seul' };
  }
  return { etat: 'publie', texte: traduction, langue: locale, mention: 'traduction' };
}
