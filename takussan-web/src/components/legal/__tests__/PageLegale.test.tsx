import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

import { PageLegale } from '@/components/legal/PageLegale';

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
  fr: '# Article 1\n\nTexte **simulé** par le test.',
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

  it('lie les deux autres documents par leur URL canonique', async () => {
    const { container } = await rendre('terms');
    const liens = [...container.querySelectorAll('main nav a')].map((a) => a.getAttribute('href'));
    expect(liens).toEqual(['/legal/privacy', '/legal/notice']);
  });
});
