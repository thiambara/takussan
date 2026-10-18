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
 * (`docker/demarrer.mjs`) ; ce module, lui, ne refuse rien : il sert aussi `next dev` et les tests,
 * qui lisent les MÊMES clés dans `.env.local` (ou retombent sur les défauts de développement).
 *
 * ⚠ **Aucune `NEXT_PUBLIC_*` pour ces trois valeurs** : Next l'inlinerait au build.
 * `scripts/check-front-env-keys.mjs` refuse toute lecture de ces clés hors de ce module.
 *
 * ⚠ **Rien de secret ne passe par ici.** Tout ce que rend {@link configPubliqueDuNavigateur} est
 * écrit en clair dans chaque page servie. Le type est fermé pour cette raison : une clé de plus
 * doit être ajoutée ici, à la main, en sachant qu'elle devient publique.
 */

/** Le défaut de développement : `./dev.sh api` sert l'API sur ce port. */
const API_PAR_DEFAUT = 'http://localhost:8002';

/**
 * L'origine de la production (`https://takussan.com/` y redirige), que la phase F met en service
 * (TCK-517). Le conteneur ne l'atteint jamais : il exige `SITE_URL`.
 *
 * ⚠ Sans barre finale. Elle est ajoutée par les concaténations, jamais par la valeur.
 */
export const ORIGINE_PRODUCTION = 'https://www.takussan.com';

/** Ce que le navigateur reçoit. Fermé : chaque clé est publique (cf. l'en-tête). */
export type ConfigPublique = {
  /** L'origine publique de l'API, sans le suffixe `/api`. */
  readonly apiUrl: string;
  /** L'origine du seau public de médias, ou `''` quand il n'y en a pas (développement). */
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
    ? nonVide(window.__TAKUSSAN_CONFIG__?.apiUrl)
    : nonVide(process.env.API_URL);
  return valeur ? sansSuffixeApi(valeur) : API_PAR_DEFAUT;
}

/**
 * L'origine du seau public de médias (ADR-0029 § 1), ou `undefined`.
 *
 * Rendue telle quelle : le loader la compare à `url.origin`, et la validation de sa forme
 * appartient au démarrage du conteneur (`docker/demarrer.mjs`).
 */
export function origineMedia(): string | undefined {
  return dansLeNavigateur()
    ? nonVide(window.__TAKUSSAN_CONFIG__?.mediaUrl)
    : nonVide(process.env.MEDIA_URL);
}

/**
 * Ce dont {@link resoudreOrigineSite} a besoin, isolé de `process.env` pour être ÉPROUVABLE.
 */
export type SourcesOrigineSite = {
  readonly siteUrl?: string | undefined;
};

/** Le nom que portent les messages d'erreur : celui que le lecteur du rouge doit corriger. */
const VARIABLE_SITE = 'SITE_URL';

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
        `schéma compris — par exemple « https://www.takussan.com » ou « https://preview.takussan.com ».`,
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
 * `SITE_URL` gagne toujours ; sans elle, {@link ORIGINE_PRODUCTION}. Le défaut ne sert que
 * `next dev` et les tests : le conteneur ne démarre pas sans `SITE_URL` (`docker/demarrer.mjs`),
 * parce qu'une préproduction qui retomberait sur ce défaut déclarerait ses pages canoniques en
 * production (ADR-0026).
 */
export function resoudreOrigineSite(sources: SourcesOrigineSite): string {
  const explicite = sources.siteUrl?.trim();
  return explicite ? normaliserOrigine(explicite, VARIABLE_SITE) : ORIGINE_PRODUCTION;
}

/** L'origine publique du site, lue à l'appel. Serveur seulement — cf. {@link resoudreOrigineSite}. */
export function origineSite(): string {
  return resoudreOrigineSite({ siteUrl: process.env.SITE_URL });
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
