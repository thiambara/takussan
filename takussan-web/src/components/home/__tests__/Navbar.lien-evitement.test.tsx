/**
 * TCK-905 (P31.04) — le site public a son lien d'évitement, en tête de la `Navbar`.
 *
 * Avant ce ticket, le seul « Aller au contenu principal » du front était celui de la console
 * super-admin : sur l'accueil et la fiche, le premier Tab allait au logo, puis 17 autres
 * traversaient la barre avant le contenu (mesuré par CDP, P31.04).
 *
 * jsdom ne fait aucune navigation par fragment : le déplacement du focus est assuré par le
 * `onClick` du lien (comme dans `SuperAdminShell`, TCK-359), et c'est lui que ce test exécute.
 * La cible doit exister dans CHAQUE page qui monte la barre : c'est la garde statique, plus bas.
 */
import React from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/** L'identifiant de la cible, écrit en clair : le test ne dépend pas du module qu'il garde. */
const CIBLE = 'contenu-principal';

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {withIntl(
        <>
          <Navbar />
          <main id={CIBLE} tabIndex={-1}>
            <p>contenu</p>
          </main>
        </>,
      )}
    </QueryClientProvider>,
  );
}

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' ? [] : fichiers(chemin);
    return /\.tsx$/.test(nom) ? [chemin] : [];
  });
}

describe('Navbar — lien d’évitement (TCK-905, P31.04)', () => {
  it('est le premier élément focalisable de la barre, vers le contenu principal', () => {
    const { container } = rendre();

    const lien = screen.getByRole('link', { name: 'Aller au contenu principal' });
    expect(lien).toHaveAttribute('href', `#${CIBLE}`);
    expect(container.querySelector('a[href], button')).toBe(lien);
    expect(lien.className).toContain('sr-only');
    expect(lien.className).toContain('focus:not-sr-only');
  });

  it('déplace le focus dans <main> quand on l’active', async () => {
    const utilisateur = userEvent.setup();
    const { container } = rendre();

    await utilisateur.click(screen.getByRole('link', { name: 'Aller au contenu principal' }));

    expect(document.activeElement).toBe(container.querySelector('main'));
  });

  it('chaque page qui monte la barre donne à son <main> la cible du lien', () => {
    const racine = join(process.cwd(), 'src');
    // Un `loading.tsx` n'est qu'un squelette (`aria-hidden`) : il n'a pas de contenu où sauter.
    const pages = fichiers(racine).filter(
      (f) => !/loading\.tsx$/.test(f) && /<Navbar\b/.test(readFileSync(f, 'utf8')),
    );
    expect(pages.length).toBeGreaterThanOrEqual(10);

    const ecarts: string[] = [];
    for (const f of pages) {
      const source = readFileSync(f, 'utf8');
      const mains = source.match(/(?<!`)<main\b[^>]*>/g) ?? []; // hors des balises citées dans un commentaire
      if (mains.length === 0) ecarts.push(`${relative(racine, f)} : aucun <main>`);
      for (const balise of mains) {
        if (!/id=\{CONTENU_PRINCIPAL_ID\}/.test(balise) || !/tabIndex=\{-1\}/.test(balise)) {
          ecarts.push(`${relative(racine, f)} : ${balise}`);
        }
      }
    }
    expect(ecarts).toEqual([]);
  });
});
