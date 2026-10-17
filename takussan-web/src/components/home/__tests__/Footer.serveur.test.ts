import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC, nommer, sourcesDe } from '@/test/analyse-statique';
import { modulesDuGrapheClient } from '@/test/graphe-client';

/**
 * TCK-745 (P33.06) — **le pied de page public est un composant serveur.**
 *
 * `Footer` était `'use client'` pour deux `useTranslations` et une année, sans état, effet ni
 * gestionnaire : chaque page serveur qui le monte (fiches, pages légales, paiement, partage,
 * alertes) payait son code dans son JS client. `useTranslations` de next-intl vaut des deux
 * côtés ; ses deux enfants interactifs (`ChoixDeLangue`, `LienLocalise`) restent client.
 *
 * Les importeurs client (`HomepageDiscovery`, `PropertiesDiscoveryPage`, `PublicFavoritesPage`,
 * `CompareClient`) le gardent dans leur graphe : ils ne sont pas tracés ici.
 */
const FOOTER = 'components/home/Footer.tsx';

const IMPORTEURS_SERVEUR = sourcesDe(RACINE_SRC).filter((f) => {
  const texte = readFileSync(f, 'utf8');
  return /from '@\/components\/home\/Footer'/.test(texte) && !/^\s*['"]use client['"]/.test(texte);
});

describe('Footer serveur', () => {
  it('trouve des importeurs serveur à tracer', () => {
    expect(IMPORTEURS_SERVEUR.map(nommer)).toContain('components/legal/PageLegale.tsx');
    expect(IMPORTEURS_SERVEUR.length).toBeGreaterThan(5);
  });

  it.each(IMPORTEURS_SERVEUR.map((f) => [nommer(f), f]))('%s : le pied de page reste hors du graphe client', (_nom, f) => {
    expect(modulesDuGrapheClient(f).has(FOOTER)).toBe(false);
  });

  it('le traceur le voit quand un importeur client le monte (témoin)', () => {
    const temoin = join(RACINE_SRC, 'components', 'property', 'HomepageDiscovery.tsx');
    expect(modulesDuGrapheClient(temoin).has(FOOTER)).toBe(true);
  });
});
