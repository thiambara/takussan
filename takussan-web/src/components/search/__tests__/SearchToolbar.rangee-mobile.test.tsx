import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { formatPrice } from '@/lib/utils';
import { ContractTypeChip } from '@/components/property/cards/ContractTypeChip';
import { SearchToolbar, type SearchToolbarProps } from '../SearchToolbar';

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
    onRemoveFilter: vi.fn(),
    onSortChange: vi.fn(),
    onPerPageChange: vi.fn(),
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

  it('« par page » n’est pas rendu sous lg (AC4) — son conteneur est `hidden lg:block`', () => {
    monte();
    const parPage = screen.getByRole('combobox', { name: /par page/i });
    const conteneur = parPage.closest('[data-controle="par-page"]');
    expect(conteneur).not.toBeNull();
    expect(classes(conteneur!)).toEqual(expect.arrayContaining(['hidden', 'lg:block']));
  });

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
  it('`afficherTri={false}` masque le tri ET la taille de page sous lg', () => {
    monte({ afficherTri: false });
    const tri = screen.getByRole('combobox', { name: /trier/i });
    const parPage = screen.getByRole('combobox', { name: /par page/i });
    // Le bureau n'est pas modifié (contrainte du ticket) : masqués SOUS lg, rendus à partir de lg.
    expect(classes(tri)).toEqual(expect.arrayContaining(['hidden', 'lg:flex']));
    expect(classes(parPage.closest('[data-controle="par-page"]')!)).toContain('hidden');
  });

  it('par défaut, le tri est rendu sous lg', () => {
    monte();
    expect(classes(screen.getByRole('combobox', { name: /trier/i }))).not.toContain('hidden');
  });
});

describe('TCK-552 — la sauvegarde vient au bout des puces (P7, AC5)', () => {
  it('rend `finDesPuces` DANS la rangée des puces, après la dernière', () => {
    monte({
      filters: { city: 'Dakar', furnished: true },
      activeCount: 2,
      finDesPuces: <button type="button">sauver</button>,
    });
    const sauver = screen.getByRole('button', { name: 'sauver' });
    const derniere = screen.getByRole('button', { name: 'Meublé' });
    expect(sauver.closest('[data-rangee="puces"]')).toBe(derniere.closest('[data-rangee="puces"]'));
    expect(derniere.compareDocumentPosition(sauver) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ne rend PAS `finDesPuces` quand aucune puce n’est posée', () => {
    monte({ filters: {}, activeCount: 0, finDesPuces: <button type="button">sauver</button> });
    expect(screen.queryByRole('button', { name: 'sauver' })).toBeNull();
  });
});

describe('TCK-552 — les puces (P8, AC7)', () => {
  it('la recherche libre est signalée par une ICÔNE, sans guillemet', () => {
    monte({ filters: { q: 'Dakar' }, activeCount: 1 });
    const puce = screen.getByRole('button', { name: /Dakar/ });
    expect(puce.textContent).not.toContain('"');
    expect(normalise(puce.textContent ?? '')).toBe('Dakar');
    expect(puce.querySelector('[data-icone="recherche"]')).not.toBeNull();
  });

  it('la puce de prix écrit le montant par la fonction de formatage des CARTES', () => {
    monte({ filters: { price_min: 150_000, price_max: 2_000_000 }, activeCount: 2 });
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
    monte({ filters: { contract_type: type }, activeCount: 1 });
    const puce = document.querySelector('[data-rangee="puces"] button')!;
    const { container } = render(withIntl(<ContractTypeChip type={type} />));
    expect(normalise(puce.textContent ?? '')).toBe(normalise(container.textContent ?? ''));
  });
});
