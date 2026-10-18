import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Le loader de Cloudflare est-il branché ? Pour tout `next build` — l'image Docker est le seul build
 * qui serve —, et jamais sous `next dev`, où l'optimiseur de Next reste (ADR-0069 § 3). L'origine
 * du seau ne se connaît qu'à l'exécution (`MEDIA_URL`), et `docker/demarrer.mjs` la valide au
 * démarrage. `next build` pose `NODE_ENV=production` avant de lire ce fichier.
 */
const LOADER_MEDIA = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  // ── `output: 'standalone'` — ADR-0028 §3 ─────────────────────────────────────────────────────
  //
  // `next build` produit `.next/standalone/server.js` et n'y copie que les modules que le serveur
  // importe réellement. L'image (takussan-web/Dockerfile) ne porte ni `node_modules` entier ni les
  // dépendances de dev. Sans effet sur `next dev`.
  output: 'standalone',
  // TCK-950 (P44.03) — pas de `X-Powered-By: Next.js` : il annonçait la pile à chaque réponse
  // (mesuré sur le standalone), sans rien apporter à personne. `smoke-web.sh` le vérifie sur l'image.
  poweredByHeader: false,
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
  // PostgreSQL et Redis, et `.env.example` livre `API_URL=http://127.0.0.1:8002`. Un outil
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
  // ── `serverActions.bodySizeLimit` — TCK-673 (P08.01) ─────────────────────────────────────────
  //
  // Le défaut est 1 Mo (`next/dist/server/app-render/action-handler.js`), multipart compris : au-delà,
  // l'action rend 413 « Body exceeded 1 MB ». Une seule photo réduite pèse déjà 1,4 Mo (TCK-542).
  // 12 Mo = une photo par action, 10 Mo au plus (`MediaManager`), plus l'enveloppe multipart. Les
  // photos partent une par une (`PropertyWizard`, `MediaManager`) : relever ce plafond ne suffit pas
  // à faire passer un lot, et ne doit pas y suffire.
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },
  images: {
    // ── Le loader de Cloudflare Transformations — ADR-0029 §4, TCK-540 ──────────
    //
    // Dans tout build (`LOADER_MEDIA`), `src/lib/image-loader.ts` remplace l'optimiseur de Next : toute image du seau public devient
    // `<media>/cdn-cgi/image/width=…,quality=75,format=auto,onerror=redirect/<chemin>?v=…` — sauf une
    // conversion de photo en WebP, servie telle quelle, sans rien facturer (TCK-585). Le
    // conteneur du front (512 Mio) n'encode plus d'AVIF, et le cache des images vit chez
    // Cloudflare au lieu de repartir à zéro à chaque déploiement. Le jeu de largeurs et la
    // qualité unique, et pourquoi (facturation par transformation unique), sont dans ce fichier.
    //
    // `loader: 'custom'` désactive l'optimiseur : `/_next/image` rend 404 dans l'image. Sous
    // `next dev`, le loader n'est pas branché et l'optimiseur sert les images de l'API locale.
    //
    // ⚠ TOUT ce qui suit dans ce bloc (formats, `remotePatterns`, durée de cache) ne concerne donc
    // plus que l'optimiseur de `next dev` — sauf `deviceSizes` et `imageSizes`, qui fixent encore
    // les largeurs du `srcset` que le loader arrondit ensuite.
    ...(LOADER_MEDIA ? { loader: 'custom' as const, loaderFile: './src/lib/image-loader.ts' } : {}),

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
      // Les seaux publics de médias (ADR-0029 §1) : pour `next dev` pointé sur une API distante.
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
      // TCK-602 (ADR-0051 §1) — le jeton d'un lien de paiement EST le droit de payer et de lire la
      // quittance : aucun `Referer` ne le porte vers le fournisseur ni vers un lien sortant. La
      // balise de `generateMetadata` ne couvre que le HTML ; l'en-tête couvre aussi la redirection
      // `/pay/…` → `/<langue>/pay/…` du proxy.
      ...['/pay/:path*', '/:locale/pay/:path*'].map((source) => ({
        source,
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      })),
    ];
  },
};

export default withNextIntl(nextConfig);
