import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

import { PageLegale, metadonneesLegales } from '@/components/legal/PageLegale';
import { origineSite } from '@/lib/alternates';
import { LOCALES_INDEXABLES } from '@/i18n/routing';

/**
 * TCK-531 — la page juridique RENDUE, branche « texte publié » comprise.
 *
 * `legal-content.test.tsx` garde la règle et le rendu markdown séparément ; tant que les vrais
 * fichiers de `src/content/legal/` sont vides, `curl` ne peut éprouver que l'état « à fournir ».
 * Ce test simule un texte déposé — dans un mock, jamais dans le fichier de contenu — pour que le
 * câblage `contenuLegal` → `<article lang>` → mention → `TexteJuridique` soit vérifié avant que le
 * porteur ne livre quoi que ce soit.
 */

let locale = 'fr';

vi.mock('next-intl/server', async () => {
  const fr = (await import('@/messages/fr.json')).default as Record<string, unknown>;
  const resous = (chemin: string): string => {
    const valeur = chemin.split('.').reduce<unknown>(
      (noeud, cle) =>
        noeud && typeof noeud === 'object' ? (noeud as Record<string, unknown>)[cle] : undefined,
      fr,
    );
    return typeof valeur === 'string' ? valeur : chemin;
  };
  return {
    getLocale: async () => locale,
    getTranslations: async (espace?: string) => (cle: string) =>
      resous(espace ? `${espace}.${cle}` : cle),
  };
});

vi.mock('@/content/legal/terms', () => ({
  fr: '# Article 1\n\nTexte **simulé** par le test.\n\n## 1.1 Détail\n\nSuite.\n\n# Article 2\n\nFin.',
  en: '',
  wo: '# Xët 1\n\nWO simulé.',
}));
vi.mock('@/content/legal/privacy', () => ({ fr: '', en: 'EN seul', wo: '' }));

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock('@/components/shared/LienLocalise', () => ({
  LienLocalise: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

async function rendre(document: 'terms' | 'privacy' | 'notice') {
  return render(await PageLegale({ document }));
}

describe('PageLegale', () => {
  beforeEach(() => {
    locale = 'fr';
  });

  it('rend le texte français déposé, sans mention, en français', async () => {
    const { container } = await rendre('terms');
    const article = container.querySelector('article');
    expect(article?.getAttribute('lang')).toBe('fr');
    expect(container.querySelector('h1')?.textContent).toBe("Conditions générales d'utilisation");
    expect(article?.querySelector('h2')?.textContent).toBe('Article 1');
    expect(article?.querySelector('strong')?.textContent).toBe('simulé');
    expect(container.textContent).not.toContain('en cours de rédaction');
    expect(container.textContent).not.toContain('seule la version française fait foi');
  });

  it('rend le français avec la mention « français seul » quand la traduction manque', async () => {
    locale = 'en';
    const { container } = await rendre('terms');
    expect(container.querySelector('article')?.getAttribute('lang')).toBe('fr');
    expect(container.textContent).toContain("n'est disponible qu'en français");
    expect(container.textContent).toContain('simulé par le test');
  });

  it('rend la traduction, marquée comme telle, quand elle existe', async () => {
    locale = 'wo';
    const { container } = await rendre('terms');
    expect(container.querySelector('article')?.getAttribute('lang')).toBe('wo');
    expect(container.textContent).toContain('seule la version française fait foi');
    expect(container.textContent).toContain('WO simulé.');
  });

  it('rend « à fournir » sans aucun texte quand le français manque — même si une traduction existe', async () => {
    locale = 'en';
    const { container } = await rendre('privacy');
    expect(container.querySelector('article')).toBeNull();
    expect(container.textContent).toContain('Document en cours de rédaction');
    expect(container.textContent).not.toContain('EN seul');
  });

  it('lie les deux autres documents par leur URL canonique — en tête au téléphone, à gauche au bureau', async () => {
    const { getAllByRole } = await rendre('terms');
    const navs = getAllByRole('navigation', { name: 'Autres documents' });
    // Deux emplacements (TCK-2516), le même contenu : l'un `lg:hidden`, l'autre `hidden lg:block`.
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      expect([...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
        '/legal/privacy',
        '/legal/notice',
      ]);
    }
  });

  it('TCK-2516 — plus de sur-titre « Informations légales »', async () => {
    const { container } = await rendre('terms');
    expect(container.textContent).not.toContain('Informations légales');
  });

  it('TCK-2516 — le sommaire (téléphone et bureau) liste les parties du texte, chacune vers son ancre', async () => {
    const { getAllByRole, container } = await rendre('terms');
    const sommaires = getAllByRole('navigation', { name: 'Sommaire' });
    expect(sommaires.length).toBeGreaterThanOrEqual(2);
    for (const nav of sommaires) {
      const liens = [...nav.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
      expect(liens).toEqual([
        ['Article 1', '#partie-1'],
        ['Article 2', '#partie-2'],
      ]);
    }
    // AC3 — sans JavaScript : un `<details>` natif, et des cibles présentes dans le HTML.
    expect(container.querySelector('details summary')).not.toBeNull();
    expect(container.querySelector('#partie-2')?.textContent).toContain('Article 2');
  });

  it('AC4 — un document sans texte français : « à fournir », et aucun sommaire', async () => {
    const { container, queryAllByRole } = await rendre('privacy');
    expect(container.textContent).toContain('Document en cours de rédaction');
    expect(queryAllByRole('navigation', { name: 'Sommaire' })).toHaveLength(0);
    expect(container.querySelector('details')).toBeNull();
  });

  it('TCK-2516 — canonique et hreflang déclarés, dans la langue de la page', async () => {
    locale = 'en';
    const meta = await metadonneesLegales('terms');
    expect(meta.alternates?.canonical).toBe(`${origineSite()}/en/legal/terms`);
    const languages = meta.alternates?.languages as Record<string, string>;
    expect(Object.keys(languages).sort()).toEqual([...LOCALES_INDEXABLES, 'x-default'].sort());
    expect(languages['x-default']).toBe(`${origineSite()}/fr/legal/terms`);
  });
});
