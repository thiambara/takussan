import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // React Compiler — ACTIVÉ, décision ADR-0033 (TCK-318). Mesuré sur ce dépôt : 870/870
  // composants compilés sans un seul abandon, +3,6 à +6,1 % de JS gzippé par page, et un
  // re-rendu de grille de 200 cartes qui passe de ~35 ms à ~1,5 ms. Exige
  // `babel-plugin-react-compiler` en devDependency : sans lui, `next build` échoue.
  reactCompiler: true,
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
