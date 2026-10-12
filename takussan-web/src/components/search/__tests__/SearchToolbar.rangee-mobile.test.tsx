import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { formatPrice } from '@/lib/utils';
import { ContractTypeChip } from '@/components/property/cards/ContractTypeChip';
import { PucesDeFiltres, SearchToolbar, type SearchToolbarProps } from '../SearchToolbar';
import type { SearchFilters } from '@/types/search';

/**
 * TCK-552 — la barre d'outils de la liste, sous `lg`.
 *
 * jsdom n'applique aucune feuille de style : ce qui est « masqué sous `lg` » ne peut s'y lire
 * qu'aux classes. Ces tests gardent donc la STRUCTURE (qui est où, dans quel ordre, rendu ou
 * non) ; les positions réelles — une seule rangée à 360 et 390 px, en trois langues — sont
 * mesurées au navigateur et consignées dans le ticket. Chaque test ci-dessous rougit sur le
 * composant d'avant TCK-552.
 */

function monte(surcharge: Partial<SearchToolbarProps> = {}) {
  const props: SearchToolbarProps = {
    total: 12,
    loading: false,
    filters: {},
    activeCount: 0,
    onSortChange: vi.fn(),
    onOpenSidebar: vi.fn(),
    ...surcharge,
  };
  return render(withIntl(<SearchToolbar {...props} />));
}

const classes = (el: Element) => el.className.split(/\s+/);

/** Normalise les espaces insécables (U+00A0, U+202F) que l'ICU pose entre les milliers. */
const normalise = (s: string) => s.replace(/[\s\u00a0\u202f]+/g, ' ').trim();

describe('TCK-552 — une seule rangée d’outils sous lg : Filtres, tri, bascule', () => {
  it('Filtres vient EN TÊTE de la rangée, avant le tri (P2, P3)', () => {
    monte();
    const filtres = screen.getByRole('button', { name: /filtres/i });
    const tri = screen.getByRole('combobox', { name: /trier/i });
    expect(filtres.parentElement).toBe(tri.parentElement);
    // DOCUMENT_POSITION_FOLLOWING : le tri SUIT Filtres dans l'ordre du document.
    expect(filtres.compareDocumentPosition(tri) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Filtres est l’action PRINCIPALE : plein, et sa pastille de compte est DANS le bouton', () => {
    monte({ activeCount: 4 });
    const filtres = screen.getByRole('button', { name: /filtres/i });
    expect(classes(filtres)).toEqual(expect.arrayContaining(['bg-primary', 'text-primary-foreground']));
    // La pastille débordait du bouton (`absolute -top-1.5 -right-1.5`, P3).
    const pastille = within(filtres).getByText('4');
    expect(classes(pastille)).not.toContain('absolute');
  });

  it('Filtres, tri et bascule ont 44 px de haut sous lg (h-11)', () => {
    monte({ basculeDeVue: <button type="button">bascule</button> });
    expect(classes(screen.getByRole('button', { name: /filtres/i }))).toContain('h-11');
    expect(classes(screen.getByRole('combobox', { name: /trier/i }))).toContain('h-11');
  });

  // « par page » (AC4) a quitté cette rangée avec TCK-635 : il est gardé à côté de la pagination,
  // `SearchToolbar.par-page.test.tsx`.

  it('la bascule de vue est rendue en BOUT de rangée, et seulement sous lg', () => {
    monte({ basculeDeVue: <button type="button">bascule</button> });
    const bascule = screen.getByRole('button', { name: 'bascule' });
    const tri = screen.getByRole('combobox', { name: /trier/i });
    const conteneur = bascule.closest('[data-controle="bascule"]')!;
    expect(classes(conteneur)).toContain('lg:hidden');
    expect(tri.compareDocumentPosition(bascule) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /**
   * TCK-505 #8 posait `flex-wrap` sur le groupe pour que 336 px de contrôles ne débordent pas
   * de 328. TCK-552 demande l'inverse — UNE rangée — et le débordement est désormais tenu par
   * le seul élément compressible : le tri, `min-w-0 flex-1`, dont la valeur se tronque. Un
   * `flex-wrap` ici ferait passer la bascule à la ligne AVANT que le tri ne rétrécisse, parce
   * que le retour à la ligne se décide sur la largeur de contenu, pas sur la largeur minimale.
   */
  it('le groupe ne se replie pas : le tri est le seul élément qui rétrécit', () => {
    monte();
    const tri = screen.getByRole('combobox', { name: /trier/i });
    expect(classes(tri.parentElement!)).not.toContain('flex-wrap');
    expect(classes(tri)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1']));
  });
});

describe('TCK-552 — les contrôles qui n’agissent pas ne sont pas rendus (M4, E1, AC8)', () => {
  it('`afficherTri={false}` masque le tri sous lg', () => {
    monte({ afficherTri: false });
    const tri = screen.getByRole('combobox', { name: /trier/i });
    // Masqué SOUS lg, rendu à partir de lg.
    expect(classes(tri)).toEqual(expect.arrayContaining(['hidden', 'lg:flex']));
  });

  it('par défaut, le tri est rendu sous lg', () => {
    monte();
    expect(classes(screen.getByRole('combobox', { name: /trier/i }))).not.toContain('hidden');
  });
});

/**
 * TCK-635 — la sauvegarde a quitté le bout des puces (les puces ont quitté l'en-tête) : elle vit
 * dans la rangée d'outils, entre le tri et la bascule. Son conteneur est `contents` : masqué sous
 * `lg` sans critère, le bouton n'y laisse pas une gouttière vide.
 */
describe('TCK-635 — la sauvegarde est dans la rangée d’outils', () => {
  it('entre le tri et la bascule', () => {
    monte({
      sauvegarde: <button type="button">sauver</button>,
      basculeDeVue: <button type="button">bascule</button>,
    });
    const tri = screen.getByRole('combobox', { name: /trier/i });
    const sauver = screen.getByRole('button', { name: 'sauver' });
    const bascule = screen.getByRole('button', { name: 'bascule' });
    expect(sauver.closest('[data-rangee-outils]')).toBe(tri.closest('[data-rangee-outils]'));
    expect(tri.compareDocumentPosition(sauver) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sauver.compareDocumentPosition(bascule) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(classes(sauver.closest('[data-controle="sauvegarde"]')!)).toContain('contents');
  });

  it('absente, rien n’est rendu à sa place', () => {
    monte();
    expect(document.querySelector('[data-controle="sauvegarde"]')).toBeNull();
  });
});

/** Les puces vivent dans l'état vide (TCK-558) : le composant est gardé seul. */
function montePuces(filters: SearchFilters, fin?: React.ReactNode) {
  return render(withIntl(<PucesDeFiltres filters={filters} onRemoveFilter={vi.fn()} fin={fin} />));
}

describe('TCK-552 — ce qui vient au bout des puces', () => {
  it('rend `fin` DANS la rangée des puces, après la dernière', () => {
    montePuces({ city: 'Dakar', furnished: true }, <button type="button">sauver</button>);
    const sauver = screen.getByRole('button', { name: 'sauver' });
    const derniere = screen.getByRole('button', { name: 'Meublé' });
    expect(sauver.closest('[data-rangee="puces"]')).toBe(derniere.closest('[data-rangee="puces"]'));
    expect(derniere.compareDocumentPosition(sauver) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ne rend PAS `fin` quand aucune puce n’est posée', () => {
    montePuces({}, <button type="button">sauver</button>);
    expect(screen.queryByRole('button', { name: 'sauver' })).toBeNull();
  });
});

describe('TCK-552 — les puces (P8, AC7)', () => {
  it('la recherche libre est signalée par une ICÔNE, sans guillemet', () => {
    montePuces({ q: 'Dakar' });
    const puce = screen.getByRole('button', { name: /Dakar/ });
    expect(puce.textContent).not.toContain('"');
    expect(normalise(puce.textContent ?? '')).toBe('Dakar');
    expect(puce.querySelector('[data-icone="recherche"]')).not.toBeNull();
  });

  it('la puce de prix écrit le montant par la fonction de formatage des CARTES', () => {
    montePuces({ price_min: 150_000, price_max: 2_000_000 });
    const textes = screen.getAllByRole('button')
      .map((b) => normalise(b.textContent ?? ''))
      .filter((t) => t.startsWith('≥') || t.startsWith('≤'));
    expect(textes).toEqual([
      `≥ ${normalise(formatPrice(150_000, 'XOF'))}`,
      `≤ ${normalise(formatPrice(2_000_000, 'XOF'))}`,
    ]);
    for (const t of textes) expect(t).not.toContain('FCFA');
  });

  /**
   * P8 — « Location » sur la puce, « En location » sur chaque carte de la même page. La puce
   * prend le mot de la pastille des cartes (`ContractTypeChip`), et non l'inverse : la pastille
   * est posée sur TOUTES les cartes du site, la puce n'existe qu'ici.
   */
  it.each(['rent', 'sale'] as const)('la puce de transaction `%s` écrit le mot de la pastille des cartes', (type) => {
    montePuces({ contract_type: type });
    const puce = document.querySelector('[data-rangee="puces"] button')!;
    const { container } = render(withIntl(<ContractTypeChip type={type} />));
    expect(normalise(puce.textContent ?? '')).toBe(normalise(container.textContent ?? ''));
  });
});
