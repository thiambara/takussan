import { ImageResponse } from 'next/og';

import { RAYONS } from '@/components/brand/Logo';

/**
 * L'image de partage par défaut du site public — TCK-759 (P09.03).
 *
 * Next la pose en `og:image` (et, par report, en `twitter:image`) sur toute page de
 * `[locale]/(public)` qui ne déclare pas ses propres `openGraph.images` : l'accueil, les listes,
 * les annuaires. Les fiches qui ont une photo gardent la leur.
 *
 * Elle est générée depuis le logo (décision du porteur) : le symbole « lever de toit » de
 * `SymboleTakussan`, mêmes tracés (`RAYONS`), et le nom, sur la tuile d'encre d'`icon.svg` —
 * toit, horizon et nom en lin, rayons en terracotta. Aucun texte d'autre : ni slogan, ni image
 * par ville (refusée par la décision). Les couleurs sont écrites en clair parce que Satori ne
 * lit pas les jetons CSS ; ce sont celles de `globals.css` (`--foreground`, `--background`,
 * `--primary`).
 */
export const alt = 'Takussan';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const ENCRE = '#1f1812';
const LIN = '#fcf9f3';
const TERRACOTTA = '#a85332';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 48,
          background: ENCRE,
        }}
      >
        <svg width={428} height={300} viewBox="2.6 11.6 42.8 30" fill="none">
          {RAYONS.map((d) => (
            <path key={d} d={d} stroke={TERRACOTTA} strokeWidth={2.6} strokeLinecap="round" />
          ))}
          <path
            d="M13 33 24 23l11 10"
            stroke={LIN}
            strokeWidth={4.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M5 39.5H43" stroke={LIN} strokeWidth={3} strokeLinecap="round" />
        </svg>
        {/* Le nom en capitales, comme le `Logo` (qui les obtient par `uppercase`). */}
        <div style={{ color: LIN, fontSize: 88, fontWeight: 600, letterSpacing: '0.14em' }}>
          {alt.toUpperCase()}
        </div>
      </div>
    ),
    size,
  );
}
