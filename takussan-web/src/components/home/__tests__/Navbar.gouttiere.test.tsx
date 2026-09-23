/**
 * TCK-551 (N7), tour 2 — la gouttière de la barre et celle du contenu des pages qui la montent.
 *
 * Tour 1 : la barre est passée de `px-6` à `px-4` sous `lg` pour s'aligner sur `/properties`
 * (logo 24, `<h1>` 16, mesuré). Le vérificateur a mesuré ce que ça coûtait AILLEURS, à 390 :
 * l'accueil, `/agents`, `/agencies` et `/agents/[slug]` avaient leur `main` en `px-6` — alignés
 * AVANT (24 / 24), désalignés APRÈS (logo 16, `<h1>` 24). Et entre 768 et 1023 px, sur
 * `/properties` (`md:px-8`), l'écart logo / `<h1>` passait de 8 à 16 px, sans qu'aucun test ne le
 * voie (mutation `px-4 md:px-6 lg:px-6` : 19 tests verts).
 *
 * Une gouttière de barre ne s'aligne que sur UNE gouttière de page. D'où les deux gardes :
 *
 * 1. la barre : 16 px sous `sm` (le téléphone, où la page occupe tout l'écran), 24 px au-delà —
 *    exactement ce qu'elle était avant ce ticket, de `sm` jusqu'au bureau ;
 * 2. sous `sm`, chaque conteneur de page (`mx-auto` + `px-*`) d'un fichier qui monte la `Navbar`
 *    commence au même x que la barre.
 *
 * jsdom ne pose aucune feuille de style : on résout les utilitaires Tailwind `px-*` à la main
 * (échelle par défaut, 1 unité = 4 px ; `sm` 640, `md` 768, `lg` 1024, `xl` 1280). Une valeur
 * arbitraire (`px-[13px]`) fait échouer la garde au lieu d'être ignorée.
 */
import React from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/fr',
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, setUser: vi.fn(), token: null }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const { Navbar } = await import('@/components/home/Navbar');

const PALIERS: ReadonlyArray<readonly [string, number]> = [['', 0], ['sm:', 640], ['md:', 768], ['lg:', 1024], ['xl:', 1280]];

/** Padding gauche (px) que les classes `px-*` / `pl-*` donnent à la largeur `largeur`. */
function gouttiere(classes: string, largeur: number): number | null {
  let valeur: number | null = null;
  for (const [prefixe, seuil] of PALIERS) {
    if (largeur < seuil) continue;
    for (const c of classes.split(/\s+/)) {
      const m = c.match(/^(?:([a-z0-9]+):)?p[xl]-(.+)$/);
      if (!m || `${m[1] ? `${m[1]}:` : ''}` !== prefixe) continue;
      if (!/^\d+(\.5)?$/.test(m[2]!)) throw new Error(`gouttière non résolue : « ${c} »`);
      valeur = Number(m[2]) * 4;
    }
  }
  return valeur;
}

function barre(): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>,
  );
  return container.querySelector('nav > div')!.className.toString();
}

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' ? [] : fichiers(chemin);
    return /\.tsx$/.test(nom) ? [chemin] : [];
  });
}

describe('Gouttière de la barre (TCK-551, N7)', () => {
  it('16 px sur téléphone, 24 px de `sm` au bureau — inchangée au-delà de `sm`', () => {
    const classes = barre();
    expect([360, 390, 639, 640, 768, 900, 1023, 1024, 1280].map((l) => gouttiere(classes, l))).toEqual([
      16, 16, 16, 24, 24, 24, 24, 24, 24,
    ]);
  });

  it('sous `sm`, le contenu de chaque page qui monte la barre commence au même x qu’elle', () => {
    const racine = join(process.cwd(), 'src');
    const pages = fichiers(racine).filter((f) => /<Navbar\b/.test(readFileSync(f, 'utf8')));
    // Accueil, liste et fiche de bien, agents, agences, favoris, comparateur, pages légales,
    // réservations… : si ce compte tombe, la recherche ci-dessus ne trouve plus les pages.
    expect(pages.length).toBeGreaterThanOrEqual(10);

    const attendu = gouttiere(barre(), 360);
    const ecarts: string[] = [];
    let conteneurs = 0;
    for (const f of pages) {
      for (const [, classes] of readFileSync(f, 'utf8').matchAll(/className="([^"]*)"/g)) {
        if (!/(^|\s)mx-auto(\s|$)/.test(classes!) || gouttiere(classes!, 360) === null) continue;
        conteneurs++;
        const x = gouttiere(classes!, 360);
        if (x !== attendu) ecarts.push(`${relative(racine, f)} : « ${classes} » → ${x} px (barre : ${attendu} px)`);
      }
    }
    expect(conteneurs).toBeGreaterThanOrEqual(10);
    expect(ecarts).toEqual([]);
  });
});
