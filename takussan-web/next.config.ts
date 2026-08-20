import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
  // MySQL et Redis, et `.env.example` livre `NEXT_PUBLIC_API_URL=http://127.0.0.1:8002`. Un outil
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
    dangerouslyAllowSVG: true,
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'preview.api.takussan.com' },
      { protocol: 'https', hostname: 'api.takussan.com' },
      { protocol: 'http', hostname: '127.0.0.1', port: '8002' },
      { protocol: 'http', hostname: 'localhost', port: '8002' },
    ],
  },
};

export default withNextIntl(nextConfig);
