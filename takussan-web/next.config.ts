import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * `NEXT_PUBLIC_MEDIA_URL` — l'origine du seau public de médias (ADR-0029 §1), ou vide.
 *
 * Validée ICI, au build, et non dans le loader : le loader compare `url.origin` à cette valeur, et
 * une barre finale ou un chemin l'y rendraient fausse sans rien casser — chaque photo repasserait
 * en silence par l'hôte source. Une valeur mal formée arrête donc la compilation.
 */
function origineMedia(valeur: string | undefined): string | undefined {
  if (!valeur) return undefined;
  let origine: string | undefined;
  try {
    origine = new URL(valeur).origin;
  } catch {}
  if (origine !== valeur) {
    throw new Error(
      `NEXT_PUBLIC_MEDIA_URL = « ${valeur} » : attendu une ORIGINE seule, sans barre finale ni chemin ` +
        `— par exemple « https://media-preview.takussan.com » (ADR-0029).`,
    );
  }
  return origine;
}

const MEDIA_URL = origineMedia(process.env.NEXT_PUBLIC_MEDIA_URL);

const nextConfig: NextConfig = {
  // ── `output: 'standalone'` — ADR-0028 §3 ─────────────────────────────────────────────────────
  //
  // `next build` produit `.next/standalone/server.js` et n'y copie que les modules que le serveur
  // importe réellement. L'image (takussan-web/Dockerfile) ne porte ni `node_modules` entier ni les
  // dépendances de dev. Sans effet sur `next dev`.
  //
  // ⚠ PAS sous Vercel, qui construit encore la production jusqu'à la phase F du plan : son
  // adaptateur (`onBuildComplete`) lit `.next/next-server.js.nft.json`, que le mode standalone ne
  // produit pas — mesuré, le build Vercel de la PR #264 meurt sur `ENOENT … next-server.js.nft.json`
  // après une compilation réussie. Vercel pose `VERCEL=1` au build ; l'image ne le pose pas.
  output: process.env.VERCEL ? undefined : 'standalone',
  // React Compiler — ACTIVÉ, décision ADR-0015 (TCK-318). Mesuré sur ce dépôt : 870/870
  // composants compilés sans un seul abandon, +3,6 à +6,1 % de JS gzippé par page, et un
  // re-rendu de grille de 200 cartes qui passe de ~35 ms à ~1,5 ms. Exige
  // `babel-plugin-react-compiler` en devDependency : sans lui, `next build` échoue.
  reactCompiler: true,
  // ── `allowedDevOrigins` — la panne qu'il ferme est MUETTE, et c'est tout son intérêt.
  //
  // Next 16 bloque par défaut ses ressources de développement (`/_next/*`, `/__nextjs*`) dès que
  // la page est servie depuis un hôte absent de cette liste. La liste par défaut ne contient que
  // `localhost` et `**.localhost` (mesuré :
  // `node_modules/next/dist/server/lib/router-utils/block-cross-site-dev.js`, qui compare la
  // valeur EXACTE du hostname de `Origin`/`Referer`).
  //
  // Ouvert sur `http://127.0.0.1:<port>`, le front rendait donc son HTML, affichait son CSS…
  // et **React ne s'hydratait jamais** : 13 réponses 403 sur `/_next/static/chunks/*`, le
  // WebSocket HMR en échec, et le formulaire de connexion soumis en GET NATIF — le mot de passe
  // partant dans l'URL. Rien ne cassait visiblement ; c'est l'interactivité qui manquait, partout
  // à la fois, ce qui ne ressemble à aucun moment à une question d'hôte. Mesuré le 2026-08-20 :
  // sonde `Object.keys(document.querySelector('form')).some(k => k.startsWith('__react'))`
  // → `false` sur `127.0.0.1`, `true` sur `localhost`, même serveur, même instant.
  //
  // Et le dépôt oriente vers l'hôte fautif : `dev.sh` annonce `127.0.0.1` pour l'API, Meilisearch,
  // PostgreSQL et Redis, et `.env.example` livre `NEXT_PUBLIC_API_URL=http://127.0.0.1:8002`. Un outil
  // end-to-end, qui vise `127.0.0.1` par défaut, y tombe aussi.
  //
  // La liste est délibérément limitée à la BOUCLE LOCALE — pas d'IP de LAN, pas de `*`. Élargir
  // au-delà rendrait ces ressources atteignables depuis le réseau, ce que le blocage par défaut
  // existe pour empêcher. `localhost` reste implicite côté Next : on ne le répète pas.
  //
  // ⚠ `[::1]` s'écrit AVEC ses crochets, et la première version de cette ligne l'écrivait sans.
  // La comparaison porte sur `new URL(origin).hostname`, qui rend `"[::1]"` — crochets compris —
  // pour `http://[::1]:3021`. Mesuré : avec `'::1'`, une requête portant cet `Origin` rendait
  // toujours 403 ; avec `'[::1]'`, elle passe. *Un correctif d'environnement se vérifie sur la
  // valeur que le code compare, jamais sur celle qu'on écrit dans le navigateur.*
  //
  // N'a d'effet QUE sur le serveur de développement — aucun build de production n'est concerné.
  // (TCK-328, ardoise D-57 ; `./dev.sh doctor` nomme le cas si cette liste disparaît.)
  allowedDevOrigins: ['127.0.0.1', '[::1]'],
  images: {
    // ── Le loader de Cloudflare Transformations — ADR-0029 §4, TCK-540 ──────────
    //
    // Quand `NEXT_PUBLIC_MEDIA_URL` est posée au build (l'image Docker : images.yml la passe),
    // `src/lib/image-loader.ts` remplace l'optimiseur de Next : toute photo du seau public devient
    // `<media>/cdn-cgi/image/width=…,quality=75,format=auto,onerror=redirect/<chemin>?v=…`. Le
    // conteneur du front (512 Mio) n'encode plus d'AVIF, et le cache des images vit chez
    // Cloudflare au lieu de repartir à zéro à chaque déploiement. Le jeu de largeurs et la
    // qualité unique, et pourquoi (facturation par transformation unique), sont dans ce fichier.
    //
    // ⚠ BRANCHÉ CONDITIONNELLEMENT, et c'est délibéré. `loader: 'custom'` désactive l'optimiseur
    // PARTOUT — Vercel compris : `/_next/image` n'est plus appelé, le loader est la seule chose
    // qui tourne. Or Vercel construit encore la production (`master`) jusqu'à la phase F, sans
    // `NEXT_PUBLIC_MEDIA_URL`, et son API sert ses médias depuis son propre disque : un loader
    // inconditionnel y rendrait chaque photo en JPEG pleine taille, sans AVIF ni redimensionnement.
    // Sans la variable — Vercel, `next dev` —, rien ne change : l'optimiseur et tout ce qui suit.
    //
    // ⚠ Quand le loader est branché, TOUT ce qui suit dans ce bloc (formats, `deviceSizes`,
    // `remotePatterns`, durée de cache) ne concerne plus que l'optimiseur absent — sauf
    // `deviceSizes` et `imageSizes`, qui fixent encore les largeurs du `srcset` que le loader
    // arrondit ensuite.
    ...(MEDIA_URL ? { loader: 'custom' as const, loaderFile: './src/lib/image-loader.ts' } : {}),

    // ── Formats — AVIF EN PREMIER, puis WebP ────────────────────────────────────
    //
    // Le défaut de Next 16 est `['image/webp']` SEUL (mesuré :
    // `node_modules/next/dist/server/image-optimizer.js`, déstructuration de
    // `nextConfig.images`). AVIF n'était donc jamais servi, à personne.
    //
    // Mesuré le 2026-08-24 avec le `sharp` du dépôt, sur une conversion `preview`
    // réelle (800 × 600), redimensionnée à la largeur que la grille demande :
    //
    //   w=640   jpeg 64,3 Ko | webp 51,5 Ko | avif(q60) 43,5 Ko
    //   w=384   jpeg 24,4 Ko | webp 19,5 Ko | avif(q60) 17,3 Ko
    //
    // L'ordre compte : l'optimiseur retient le PREMIER format de cette liste que
    // l'`Accept` du client annonce. Chrome, Edge, Firefox et Safari 16+ annoncent
    // `image/avif` ; les autres retombent sur WebP, puis sur le format source.
    //
    // ⚠ AVIF coûte nettement plus cher à ENCODER que WebP. La dépense est payée une
    // fois par (image, largeur, qualité) — l'optimiseur écrit son résultat sur
    // disque — mais elle est payée par le premier visiteur de chaque variante. C'est
    // un arbitrage assumé sur un marché où la bande passante mobile coûte plus cher
    // que le CPU d'un serveur.
    formats: ['image/avif', 'image/webp'],

    // ── Largeurs candidates — plafonnées à 1920 ────────────────────────────────
    //
    // Le défaut de Next ajoute `2048` et `3840`. Or la plus grande image que cette
    // API sert est la conversion `preview`, LARGE DE 800 px (`Property::
    // registerMediaConversions`) : au-dessus de 828, l'optimiseur ne peut plus que
    // ré-encoder la source sans y ajouter un pixel. Une entrée `3840w` dans le
    // `srcset` n'est donc pas une option de qualité, c'est une invitation faite au
    // navigateur à télécharger un ré-encodage plus lourd de la MÊME image.
    //
    // Mesuré sur la fiche d'un bien, viewport 1920 : la grande tuile de la mosaïque
    // demandait `w=1920` pour 604 px occupés. Les `sizes` ont été corrigés (cf.
    // `card-image-sizes.ts` et `PropertyGalleryMosaic`), et ce plafond est la
    // seconde barrière — celle qui tient quand un futur `sizes` sera faux.
    //
    // 1920 et non 1080 : la visionneuse plein écran (`PropertyLightbox`, `100vw`)
    // est la seule surface qui consomme légitimement une grande largeur, et elle
    // sert `photo.original` — qui, pour un porteur du droit `viewRaw`, N'EST PAS
    // plafonné à 800 px.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],

    // ⚠ La durée de cache VUE PAR LE NAVIGATEUR ne se règle PAS ici.
    //
    // L'optimiseur émet `max-age = max(minimumCacheTTL, max-age de l'amont)` — et
    // l'amont, c'est l'API : le matcher `@storage` de `takussan-api/docker/Caddyfile`
    // (qui reprend le `location /storage/` de l'ancien vhost nginx), et qui domine le
    // défaut de 4 h de `minimumCacheTTL`. Les deux valeurs bougent ensemble ou pas du
    // tout ; le raisonnement (et ce qui interdit `immutable`) vit dans ce Caddyfile.
    //
    // ⚠⚠ En DÉVELOPPEMENT, rien de tout cela ne s'applique : Next force
    // `max-age=0, must-revalidate` quel que soit l'amont (`image-optimizer.js`,
    // `isDev ? 0 : maxAge`). Vérifié le 2026-08-24 — `placehold.co` annonce
    // `max-age=1209600` et ressort quand même en `max-age=0`. Les 304 qu'on voit
    // sur `/_next/image` en rechargeant une liste sont ce comportement-là, pas un
    // défaut de configuration : ils n'existent pas en production.
    dangerouslyAllowSVG: true,
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'preview.api.takussan.com' },
      { protocol: 'https', hostname: 'api.takussan.com' },
      // Les seaux publics de médias (ADR-0029 §1). Sans effet quand le loader est branché ; utile à
      // l'optimiseur de Vercel si l'API de production sert un jour ses médias depuis R2 avant la
      // phase F.
      { protocol: 'https', hostname: 'media-preview.takussan.com' },
      { protocol: 'https', hostname: 'media.takussan.com' },
      { protocol: 'http', hostname: '127.0.0.1', port: '8002' },
      { protocol: 'http', hostname: 'localhost', port: '8002' },
    ],
  },
  // ── `X-Build-Sha` — ADR-0028 §10 : le code servi se prouve ───────────────────────────────────
  //
  // `BUILD_SHA` est un argument de build (takussan-web/Dockerfile) : la valeur est figée au build,
  // ce qui est exactement ce qu'on veut prouver. `.github/workflows/images.yml` n'est vert que
  // lorsque l'URL publique rend le commit poussé. Hors image — `next dev`, tests —, « inconnu ».
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Build-Sha', value: process.env.BUILD_SHA ?? 'inconnu' }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
