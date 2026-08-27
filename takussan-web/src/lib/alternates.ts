import type { Metadata } from 'next';

import { DEFAULT_LOCALE } from '@/i18n/config';
import { LOCALES_INDEXABLES, cheminLocalise, estCheminLocalisable } from '@/i18n/routing';

/**
 * L'origine publique du site. `NEXT_PUBLIC_SITE_URL` la surcharge (prévisualisations Vercel), et
 * le défaut est l'origine mesurée en production : `https://www.takussan.com/` rend 200,
 * `https://takussan.com/` rend 307 vers `www` (CLAUDE.md § Workflow git).
 *
 * ⚠ Sans barre finale. Elle est ajoutée par les concaténations ci-dessous, jamais par la valeur.
 */
export const ORIGINE_SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.takussan.com').replace(
  /\/+$/,
  '',
);

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
 * ⚠️ **Les URL sont ABSOLUES, délibérément.** `alternates.languages` accepte des chemins relatifs,
 * que Next résout contre `metadataBase` — absent de ce dépôt au 2026-08-27, et objet de TCK-433.
 * Sans lui, Next replie silencieusement sur `http://localhost:3000` : le `hreflang` sortirait en
 * production en pointant vers la machine du développeur. Une URL absolue ne dépend d'aucun réglage
 * que ce fichier ne contrôle pas, et reste juste le jour où TCK-433 posera `metadataBase`.
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
    languages[locale] = `${ORIGINE_SITE}${cheminLocalise(chemin, locale)}`;
  }
  languages['x-default'] = `${ORIGINE_SITE}${cheminLocalise(chemin, DEFAULT_LOCALE)}`;

  return { languages };
}
