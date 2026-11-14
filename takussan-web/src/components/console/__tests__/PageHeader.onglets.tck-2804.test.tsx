/**
 * TCK-2804 — au téléphone, les onglets de page commencent sous l'en-tête et y collent : la règle du gabarit.
 *
 * jsdom n'applique aucune feuille et ne calcule aucune position : la position et le collant se prouvent au
 * navigateur (relevés de la fiche TCK-2628, O1). Ce fichier garde ce que jsdom peut voir :
 * 1. le DOM : sans `dessous`, rien ne change (AC5) ; avec, la racine et l'emplacement portent la règle ;
 * 2. la règle COMPILÉE par le Tailwind du dépôt : sous `md` seulement, et seulement quand la page porte le
 *    marqueur `ONGLETS_DE_PAGE` — une barre de filtres, qui ne le porte pas, ne colle pas (AC3, AC4) ;
 * 3. le classement des appelants : le marqueur n'est posé que par des rangées d'onglets de page.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/reports',
  useSearchParams: () => new URLSearchParams(''),
}));

const { PageHeader, ONGLETS_DE_PAGE } = await import('../PageHeader');
const { ENVELOPPE_DU_CONTENU } = await import('@/components/layout/PagePleineLargeur');
const { OngletsDesRapports } = await import('@/components/rapports/OngletsDesRapports');
const { OngletsDesLoyers } = await import('@/components/payments/bailleur/OngletsDesLoyers');

const ICI = dirname(fileURLToPath(import.meta.url));
const SRC = join(ICI, '..', '..', '..');
const GLOBALS = join(SRC, 'app', 'globals.css');

const COLLE = [
  'max-md:has-[[data-onglets-de-page]]:sticky',
  'max-md:has-[[data-onglets-de-page]]:top-0',
  'max-md:has-[[data-onglets-de-page]]:z-20',
  'max-md:has-[[data-onglets-de-page]]:bg-background',
];

function OngletsMarques() {
  return (
    <nav aria-label="Sections" {...ONGLETS_DE_PAGE}>
      <a href="?a">A</a>
    </nav>
  );
}

describe('TCK-2804 — le DOM du gabarit', () => {
  it('AC5 — sans `dessous`, l’en-tête est la racine et ne porte que la classe de l’appelant', () => {
    const { container } = render(<PageHeader title="Baux" description="d" className="mb-6" />);
    const racine = container.firstElementChild as HTMLElement;
    expect(racine.tagName).toBe('HEADER');
    expect(container.childElementCount).toBe(1);
    expect(racine.className).toBe('flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-6');
    expect(container.innerHTML).not.toContain('onglets-de-page');
  });

  it('avec un fil mais sans `dessous`, la racine ne porte aucune règle collante', () => {
    const { container } = render(<PageHeader title="Bail" fil={{ label: 'Fil', etapes: [{ label: 'Baux', href: '/app/leases' }, { label: 'Bail' }] }} className="x" />);
    expect((container.firstElementChild as HTMLElement).className).toBe('x');
  });

  it('avec `dessous`, la racine colle sous `md` et l’emplacement y perd ses 20 px — quand il porte des onglets de page', () => {
    const { container } = render(<PageHeader title="Rapports" className="max-md:[&>header]:hidden" dessous={<OngletsMarques />} />);
    const racine = container.firstElementChild as HTMLElement;
    expect(racine.className.split(' ')).toEqual(expect.arrayContaining([...COLLE, 'max-md:[&>header]:hidden']));
    const emplacement = screen.getByRole('navigation', { name: 'Sections' }).parentElement as HTMLElement;
    expect(emplacement.className).toBe('mt-5 max-md:has-[[data-onglets-de-page]]:mt-0');
    // L'élément qui colle est la RACINE : son bloc conteneur est la page, pas la racine haute des seuls onglets.
    expect(racine.querySelector('[data-onglets-de-page]')).not.toBeNull();
  });
});

describe('TCK-2804 — la règle compilée : sous `md`, et seulement avec le marqueur', () => {
  it('collant, marge de l’emplacement, marge haute de l’enveloppe, réserve du défilement', async () => {
    const dossier = mkdtempSync(join(tmpdir(), 'takussan-tw-onglets-'));
    const contenu = join(dossier, 'contenu.html');
    writeFileSync(
      contenu,
      `<div class="${COLLE.join(' ')} mt-5 max-md:has-[[data-onglets-de-page]]:mt-0 ${ENVELOPPE_DU_CONTENU} max-md:has-[[data-onglets-de-page]]:scroll-pt-12"></div>`,
    );
    const css = readFileSync(GLOBALS, 'utf8');
    const source = [
      '@import "tailwindcss" source(none);',
      `@source "${contenu}";`,
      css.split('\n').filter((l) => !/^@import\s+"tailwindcss"/.test(l)).join('\n'),
    ].join('\n');
    const compile = (await postcss([tailwind()]).process(source, { from: GLOBALS })).css;
    const regle = (classe: string) => {
      const i = compile.indexOf(`.${classe.replace(/[[\]:&>-]/g, (c) => (c === '-' ? '-' : `\\${c}`))}`);
      expect(i, classe).toBeGreaterThan(-1);
      return compile.slice(i, compile.indexOf('}', compile.indexOf('}', i) + 1) + 1);
    };
    const attendus: [string, RegExp][] = [
      ['max-md:has-[[data-onglets-de-page]]:sticky', /position: sticky;/],
      ['max-md:has-[[data-onglets-de-page]]:top-0', /top: calc\(var\(--spacing\) \* 0\);/],
      ['max-md:has-[[data-onglets-de-page]]:z-20', /z-index: 20;/],
      ['max-md:has-[[data-onglets-de-page]]:bg-background', /background-color: var\(--background\);/],
      ['max-md:has-[[data-onglets-de-page]]:mt-0', /margin-top: calc\(var\(--spacing\) \* 0\);/],
      ['max-md:has-[[data-onglets-de-page]]:pt-0', /padding-top: calc\(var\(--spacing\) \* 0\);/],
      ['max-md:has-[[data-onglets-de-page]]:scroll-pt-12', /scroll-padding-top: calc\(var\(--spacing\) \* 12\);/],
    ];
    for (const [classe, declaration] of attendus) {
      const r = regle(classe);
      // AC3 — sous `md` seulement : dès 768 px, aucune de ces règles ne s'applique.
      expect(r, classe).toMatch(/@media \(width < 48rem\)/);
      // AC4 — seulement quand l'élément CONTIENT le marqueur : une barre de filtres ne le porte pas.
      expect(r, classe).toMatch(/&:has\([^)]*\[data-onglets-de-page\]/);
      expect(r, classe).toMatch(declaration);
    }
  }, 60_000);
});

describe('TCK-2804 — les rangées d’onglets de page portent le marqueur, avec leur fond', () => {
  it('Rapports : le marqueur et le fond plein sous `md`, 44 px d’appui (h-11, comme `OngletsTel`)', () => {
    render(<OngletsDesRapports onglets={[{ id: 'ensemble', libelle: 'Vue d’ensemble' }]} aria="Sections du rapport" />);
    const nav = screen.getByRole('navigation', { name: 'Sections du rapport' });
    expect(nav).toHaveAttribute('data-onglets-de-page', '');
    expect(nav.className.split(' ')).toContain('max-md:bg-background');
    expect(screen.getByRole('link', { name: 'Vue d’ensemble' }).className.split(' ')).toContain('h-11');
  });

  it('Loyers : la rangée colle sous `md` ; l’onglet a 32 px de visuel et 44 d’appui par son `::before`', () => {
    render(withIntl(<OngletsDesLoyers actif="revenus" />));
    const nav = screen.getAllByRole('navigation')[0] as HTMLElement;
    expect(nav).toHaveAttribute('data-onglets-de-page', '');
    expect(nav.className.split(' ')).toEqual(expect.arrayContaining(['max-md:bg-background', 'max-md:pt-3.5']));
    expect((nav.parentElement as HTMLElement).className.split(' ')).toEqual(expect.arrayContaining(['max-md:sticky', 'max-md:top-0', 'max-md:z-20']));
    for (const lien of screen.getAllByRole('link')) {
      // 20 px de texte + `pb-3` = 32 visibles ; le `::before` remonte de 12 px (`-top-3`) dans le `pt-3.5` de la rangée.
      expect(lien.className.split(' ')).toEqual(
        expect.arrayContaining(['max-md:h-auto', 'max-md:pb-3', 'max-md:before:absolute', 'max-md:before:inset-x-0', 'max-md:before:-top-3', 'max-md:before:bottom-0']),
      );
    }
  });
});

describe('TCK-2804 — le classement des appelants de `dessous` (AC4)', () => {
  // Famille « filtres » : barres de recherche, vues et filtres, indicateurs, semaine. Aucune ne pose le marqueur.
  const FILTRES = [
    'components/pipeline/PageDuPipeline.tsx',
    'components/leads/ContactLeadsInbox.tsx',
    'components/journee/MaJournee.tsx',
    'components/owners/OwnersList.tsx',
    'components/maintenance/files/InterventionsDeLAgence.tsx',
    'components/customer-dashboard/liste/ListeDesClients.tsx',
  ];
  it.each(FILTRES)('%s ne pose pas le marqueur des onglets de page', (fichier) => {
    const source = readFileSync(join(SRC, fichier), 'utf8');
    expect(source).toContain('dessous=');
    expect(source).not.toMatch(/ONGLETS_DE_PAGE|data-onglets-de-page/);
  });
});
