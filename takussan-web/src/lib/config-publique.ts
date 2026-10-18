/**
 * La configuration publique du front — ADR-0069 § 3 — et le SEUL module qui la lit.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * UNE IMAGE PAR COMMIT : LA CONFIGURATION SE LIT À L'EXÉCUTION
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Trois valeurs changent d'un environnement à l'autre : l'origine de l'API, celle du site et celle
 * du seau public de médias. Sous leur nom `NEXT_PUBLIC_*`, Next les INLINE à la compilation — y
 * compris dans le code serveur —, ce qui faisait une image par environnement. Elles se lisent donc
 * sous des noms que Next ne touche pas, `API_URL`, `SITE_URL` et `MEDIA_URL`, posés dans Dokploy
 * sur le service :
 *
 * · le SERVEUR les lit dans `process.env`, à chaque appel ;
 * · le NAVIGATEUR les reçoit du layout racine, qui sérialise {@link scriptDeConfigPublique} dans la
 *   page : `window.__TAKUSSAN_CONFIG__`. Aucun composant ne relit `process.env` côté client.
 *
 * ⚠ **Des fonctions, jamais des constantes de module.** Une constante est évaluée là où le module
 * est importé la première fois — au build, pour une route prérendue —, et elle y fige la valeur de
 * la machine de build. Le conteneur refuse de démarrer sans les trois valeurs
 * (`docker/demarrer.mjs`) ; ce module, lui, ne refuse rien : il sert aussi `next dev`, les tests
 * et Vercel.
 *
 * ⚠ **Le repli `NEXT_PUBLIC_*` ne vaut que pour Vercel et le développement**, et disparaît avec
 * Vercel (phase F, F5). Il s'écrit en accès LITTÉRAL (`process.env.NEXT_PUBLIC_API_URL`) : Next ne
 * substitue que cette forme exacte. `scripts/check-front-env-keys.mjs` refuse toute lecture de ces
 * trois clés hors de ce module et de `next.config.ts`.
 *
 * ⚠ **Rien de secret ne passe par ici.** Tout ce que rend {@link configPubliqueDuNavigateur} est
 * écrit en clair dans chaque page servie. Le type est fermé pour cette raison : une clé de plus
 * doit être ajoutée ici, à la main, en sachant qu'elle devient publique.
 */

/** Le défaut de développement : `./dev.sh api` sert l'API sur ce port. */
const API_PAR_DEFAUT = 'http://localhost:8002';

/**
 * L'origine MESURÉE de la production : `https://www.takussan.com/` rend 200, `https://takussan.com/`
 * rend 307 vers `www` (CLAUDE.md § Workflow git, relevé du 2026-08-20 dans
 * `docs/infra/frontend-deploiement.json`).
 *
 * ⚠ Sans barre finale. Elle est ajoutée par les concaténations, jamais par la valeur.
 */
export const ORIGINE_PRODUCTION = 'https://www.takussan.com';

/** Ce que le navigateur reçoit. Fermé : chaque clé est publique (cf. l'en-tête). */
export type ConfigPublique = {
  /** L'origine publique de l'API, sans le suffixe `/api`. */
  readonly apiUrl: string;
  /** L'origine du seau public de médias, ou `''` quand il n'y en a pas (développement, Vercel). */
  readonly mediaUrl: string;
};

declare global {
  interface Window {
    __TAKUSSAN_CONFIG__?: ConfigPublique;
  }
}

function dansLeNavigateur(): boolean {
  return typeof window !== 'undefined';
}

function nonVide(valeur: string | undefined): string | undefined {
  const propre = valeur?.trim();
  return propre ? propre : undefined;
}

/** `https://api.exemple.test/api` et `https://api.exemple.test` désignent la même API. */
function sansSuffixeApi(valeur: string): string {
  return valeur.replace(/\/+$/, '').replace(/\/api$/, '');
}

/**
 * L'origine publique de l'API, sans `/api` — l'URL que le NAVIGATEUR joint, et celle que le serveur
 * joint quand `API_INTERNAL_URL` n'est pas posée (cf. `baseServeur()` dans `lib/api.ts`).
 */
export function origineApi(): string {
  const valeur = dansLeNavigateur()
    ? nonVide(window.__TAKUSSAN_CONFIG__?.apiUrl) ?? nonVide(process.env.NEXT_PUBLIC_API_URL)
    : nonVide(process.env.API_URL) ?? nonVide(process.env.NEXT_PUBLIC_API_URL);
  return valeur ? sansSuffixeApi(valeur) : API_PAR_DEFAUT;
}

/**
 * L'origine du seau public de médias (ADR-0029 § 1), ou `undefined`.
 *
 * Rendue telle quelle : le loader la compare à `url.origin`, et la validation de sa forme
 * appartient au démarrage du conteneur (`docker/demarrer.mjs`) et au build hors conteneur
 * (`next.config.ts`).
 */
export function origineMedia(): string | undefined {
  return dansLeNavigateur()
    ? nonVide(window.__TAKUSSAN_CONFIG__?.mediaUrl) ?? nonVide(process.env.NEXT_PUBLIC_MEDIA_URL)
    : nonVide(process.env.MEDIA_URL) ?? nonVide(process.env.NEXT_PUBLIC_MEDIA_URL);
}

/**
 * Ce dont {@link resoudreOrigineSite} a besoin, isolé de `process.env` pour être ÉPROUVABLE.
 */
export type SourcesOrigineSite = {
  readonly siteUrl?: string | undefined;
  readonly vercelEnv?: string | undefined;
  readonly vercelUrl?: string | undefined;
};

/** Le nom que portent les messages d'erreur : celui que le lecteur du rouge doit corriger. */
const VARIABLE_SITE = 'SITE_URL (NEXT_PUBLIC_SITE_URL sous Vercel)';

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
 * L'origine publique du site — le seul endroit du dépôt qui la décide.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * TROIS SOURCES, DANS CET ORDRE, ET LA DEUXIÈME EST CELLE QUI MANQUAIT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * 1. `SITE_URL` (ou `NEXT_PUBLIC_SITE_URL`, sous Vercel) — le choix explicite, il gagne toujours.
 * 2. **Une prévisualisation Vercel sert son PROPRE hôte.** Sans cette branche, le défaut de
 *    production s'appliquait aux 212 déploiements « Preview » relevés le 2026-08-20
 *    (`docs/infra/frontend-deploiement.json`) : chaque prévisualisation émettait des `hreflang`,
 *    un `canonical` et un sitemap pointant `https://www.takussan.com`. Le défaut ne se voit sur
 *    aucune page — il ne se voit que chez le moteur, qui reçoit d'une URL de test l'affirmation
 *    « la version canonique de cette page est en production ».
 * 3. {@link ORIGINE_PRODUCTION}, le relevé.
 *
 * ⚠️ **Hors production ET sans hôte connaissable, on ÉCHOUE au lieu de deviner.** C'est le seul
 * cas où une origine par défaut serait à coup sûr fausse : on sait qu'on n'est pas en production,
 * et on ne sait pas où on est. Le message nomme la variable, qui est le remède. Le conteneur, lui,
 * ne démarre pas sans `SITE_URL` : il n'atteint jamais le défaut.
 *
 * ⚠ **`VERCEL_ENV` / `VERCEL_URL` NUES, pas leurs jumelles `NEXT_PUBLIC_VERCEL_*`.** Les jumelles
 * n'existent que si le projet Vercel expose ses variables système — un réglage du tableau de bord
 * que ce dépôt ne peut pas lire (`docs/infra/frontend-deploiement.json`, champ `non_mesure`). Les
 * nues, elles, sont posées par la plateforme sans condition, côté serveur — et seul le serveur
 * appelle {@link origineSite} : les canoniques, les `hreflang`, le sitemap et `robots.txt`.
 */
export function resoudreOrigineSite(sources: SourcesOrigineSite): string {
  const explicite = sources.siteUrl?.trim();
  if (explicite) return normaliserOrigine(explicite, VARIABLE_SITE);

  const environnement = sources.vercelEnv?.trim();
  if (environnement && environnement !== 'production') {
    const hote = sources.vercelUrl?.trim();
    if (!hote) {
      throw new Error(
        `Environnement Vercel « ${environnement} » sans hôte connaissable : ni ${VARIABLE_SITE}, ` +
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

/** L'origine publique du site, lue à l'appel. Serveur seulement — cf. {@link resoudreOrigineSite}. */
export function origineSite(): string {
  return resoudreOrigineSite({
    siteUrl: nonVide(process.env.SITE_URL) ?? process.env.NEXT_PUBLIC_SITE_URL,
    vercelEnv: process.env.VERCEL_ENV,
    vercelUrl: process.env.VERCEL_URL,
  });
}

/** Ce que le layout racine transmet au navigateur. Serveur seulement. */
export function configPubliqueDuNavigateur(): ConfigPublique {
  return { apiUrl: origineApi(), mediaUrl: origineMedia() ?? '' };
}

/**
 * Le corps du `<script>` que le layout racine écrit dans `<head>`, exécuté avant tout bundle.
 *
 * Sérialisé en JSON, puis `<` échappé : une valeur portant `</script>` fermerait la balise et
 * ouvrirait une injection — ces valeurs viennent de l'environnement, pas d'un visiteur, mais la
 * règle ne coûte rien. U+2028 et U+2029, valides en JSON, ne l'étaient pas dans une chaîne
 * JavaScript avant ES2019 : échappés aussi, comme `litteral()` dans `lib/pwa/service-worker.ts`.
 */
export function scriptDeConfigPublique(config: ConfigPublique = configPubliqueDuNavigateur()): string {
  const json = JSON.stringify(config)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `window.__TAKUSSAN_CONFIG__=${json};`;
}
