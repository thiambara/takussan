import type { Metadata } from 'next';

import { DEFAULT_LOCALE } from '@/i18n/config';
import { LOCALES_INDEXABLES, cheminLocalise, estCheminLocalisable } from '@/i18n/routing';

/**
 * L'origine MESURÉE de la production : `https://www.takussan.com/` rend 200, `https://takussan.com/`
 * rend 307 vers `www` (CLAUDE.md § Workflow git, relevé du 2026-08-20 dans
 * `docs/infra/frontend-deploiement.json`).
 *
 * ⚠ Sans barre finale. Elle est ajoutée par les concaténations, jamais par la valeur.
 */
export const ORIGINE_PRODUCTION = 'https://www.takussan.com';

/**
 * Ce dont {@link resoudreOrigineSite} a besoin, isolé de `process.env` pour être ÉPROUVABLE.
 *
 * ⚠ Le point d'appel écrit `process.env.NEXT_PUBLIC_…` en accès LITTÉRAL, et pas
 * `resoudreOrigineSite(process.env)` : Next substitue `NEXT_PUBLIC_*` à la compilation en
 * réécrivant l'expression exacte `process.env.NOM`. Passer l'objet entier tuerait la substitution
 * dans un bundle client — silencieusement, comme toujours avec ces variables.
 */
export type SourcesOrigineSite = {
  readonly siteUrl?: string | undefined;
  readonly vercelEnv?: string | undefined;
  readonly vercelUrl?: string | undefined;
};

/**
 * Normalise une valeur d'environnement en ORIGINE — schéma + hôte + port, rien d'autre.
 *
 * Elle refuse trois formes que l'ancienne normalisation (`.replace(/\/+$/, '')`) acceptait en
 * silence, et chacune produisait des URL fausses partout à la fois :
 *
 * · une valeur non analysable (`www.takussan.com` sans schéma, `undefined` recopié depuis un
 *   `.env` mal rempli) → toutes les URL du sitemap et tous les `hreflang` deviennent relatifs ;
 * · un schéma autre que http(s) → un `<loc>` que rien ne peut suivre ;
 * · un CHEMIN de base (`https://exemple.test/site`) → il serait silencieusement conservé, et
 *   `${origine}/fr/properties/x` rendrait `…/site/fr/properties/x`, une URL qui n'existe pas.
 *
 * *Une origine devinée est pire qu'une origine absente : elle produit un sitemap plausible et
 * faux.* Le message nomme la variable, parce que c'est la seule chose que le lecteur du rouge
 * puisse corriger.
 */
function normaliserOrigine(valeur: string, variable: string): string {
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    throw new Error(
      `${variable} = « ${valeur} » n'est pas une URL absolue. Attendu : une ORIGINE complète, ` +
        `schéma compris — par exemple « https://www.takussan.com » ou « https://mon-preview.vercel.app ».`,
    );
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(
      `${variable} = « ${valeur} » porte le schéma « ${url.protocol} ». Seuls http et https sont servis.`,
    );
  }

  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error(
      `${variable} = « ${valeur} » porte un chemin, une requête ou une ancre. Attendu : l'ORIGINE ` +
        `seule (« ${url.origin} »). Un chemin de base serait recopié devant chaque URL du site.`,
    );
  }

  return url.origin;
}

/**
 * L'origine publique du site, résolue une fois — et le seul endroit du dépôt qui la décide.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * TROIS SOURCES, DANS CET ORDRE, ET LA DEUXIÈME EST CELLE QUI MANQUAIT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — le choix explicite, il gagne toujours.
 * 2. **Une prévisualisation Vercel sert son PROPRE hôte.** Sans cette branche, le défaut de
 *    production s'appliquait aux 212 déploiements « Preview » relevés le 2026-08-20
 *    (`docs/infra/frontend-deploiement.json`) : chaque prévisualisation émettait des `hreflang`,
 *    un `canonical` et un sitemap pointant `https://www.takussan.com`. Le défaut ne se voit sur
 *    aucune page — il ne se voit que chez le moteur, qui reçoit d'une URL de test l'affirmation
 *    « la version canonique de cette page est en production ».
 * 3. `ORIGINE_PRODUCTION`, le relevé.
 *
 * ⚠️ **Hors production ET sans hôte connaissable, on ÉCHOUE au lieu de deviner.** C'est le seul
 * cas où une origine par défaut serait à coup sûr fausse : on sait qu'on n'est pas en production,
 * et on ne sait pas où on est. Le message nomme `NEXT_PUBLIC_SITE_URL`, qui est le remède.
 *
 * ⚠ **`VERCEL_ENV` / `VERCEL_URL` NUES, pas leurs jumelles `NEXT_PUBLIC_VERCEL_*`.** Les jumelles
 * n'existent que si le projet Vercel expose ses variables système — un réglage du tableau de bord
 * que ce dépôt ne peut pas lire (`docs/infra/frontend-deploiement.json`, champ `non_mesure`).
 * Les nues, elles, sont posées par la plateforme sans condition, côté serveur. Or les **neuf**
 * importateurs de ce module sont tous des fichiers serveur — mesuré le 2026-08-27 : les cinq
 * `generateMetadata` publiques, `sitemap.ts`, `robots.ts`, `src/lib/sitemap.ts` et un test. Rien
 * ici ne franchit la frontière client, donc rien n'a besoin d'être inliné.
 *
 * Si un composant client venait à importer ce module, `process.env.VERCEL_URL` y vaudrait
 * `undefined` et la résolution retomberait sur {@link ORIGINE_PRODUCTION} : le repli juste pour
 * du code qui, par construction, ne s'exécute que sur l'origine déjà servie.
 */
export function resoudreOrigineSite(sources: SourcesOrigineSite): string {
  const explicite = sources.siteUrl?.trim();
  if (explicite) return normaliserOrigine(explicite, 'NEXT_PUBLIC_SITE_URL');

  const environnement = sources.vercelEnv?.trim();
  if (environnement && environnement !== 'production') {
    const hote = sources.vercelUrl?.trim();
    if (!hote) {
      throw new Error(
        `Environnement Vercel « ${environnement} » sans hôte connaissable : ni NEXT_PUBLIC_SITE_URL, ` +
          `ni VERCEL_URL. Replier sur ${ORIGINE_PRODUCTION} ferait déclarer à cette prévisualisation ` +
          `que ses pages canoniques sont celles de la production. Déclarer NEXT_PUBLIC_SITE_URL.`,
      );
    }
    // `VERCEL_URL` est un HÔTE nu (`takussan-git-dev-x.vercel.app`), sans schéma — mesuré dans la
    // documentation Vercel et vrai des deux jumelles. Une valeur déjà schématisée est acceptée
    // telle quelle plutôt que doublement préfixée.
    return normaliserOrigine(hote.includes('://') ? hote : `https://${hote}`, 'VERCEL_URL');
  }

  return ORIGINE_PRODUCTION;
}

/** L'origine publique du site. Résolue à l'import ; cf. {@link resoudreOrigineSite}. */
export const ORIGINE_SITE = resoudreOrigineSite({
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  vercelEnv: process.env.VERCEL_ENV,
  vercelUrl: process.env.VERCEL_URL,
});

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
