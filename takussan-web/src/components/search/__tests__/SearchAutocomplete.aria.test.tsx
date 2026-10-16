/**
 * TCK-731 (P31.01, P07.06) — le champ de recherche est un combobox ARIA 1.2 dont toute référence
 * vise un élément présent, et dont le focus se voit.
 *
 * Mesuré par axe sur chaque page publique à 1280 px : `aria-valid-attr-value` (critique), parce
 * qu'`aria-controls` visait en permanence la liste, qui n'est montée qu'ouverte. Et au clavier,
 * l'`input` (`outline-none`) et sa pilule gardaient les mêmes styles calculés avant et après le
 * focus. jsdom ne pose aucune feuille de style : la garde du focus porte sur les classes.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchAutocomplete } from '../SearchAutocomplete';
import frMessages from '@/messages/fr.json';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useSuggest', () => ({ useSuggest: vi.fn() }));

const suggestions = {
  data: {
    cities: [{ label: 'Dakar', slug: 'dakar', count: 12 }],
    neighborhoods: [{ label: 'Almadies', city: 'Dakar', slug: 'almadies', count: 5 }],
    property_types: [],
  },
};

async function suggerer(etat: { data: unknown; isLoading: boolean; isFetching: boolean }) {
  const { useSuggest } = await import('@/hooks/useSuggest');
  (useSuggest as ReturnType<typeof vi.fn>).mockReturnValue(etat);
}

function monter(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="fr" messages={frMessages}>{node}</NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Toute valeur d'`aria-controls` / `aria-activedescendant` du rendu, et si son `id` existe. */
function referencesPendantes(racine: HTMLElement): string[] {
  const pendantes: string[] = [];
  for (const attr of ['aria-controls', 'aria-activedescendant', 'aria-labelledby']) {
    racine.querySelectorAll(`[${attr}]`).forEach((el) => {
      for (const id of (el.getAttribute(attr) ?? '').split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) pendantes.push(`${el.tagName.toLowerCase()}[${attr}="${id}"]`);
      }
    });
  }
  return pendantes;
}

const classesDe = (el: Element | null) => (el?.className ?? '').split(/\s+/);

describe('SearchAutocomplete — références ARIA (P31.01)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fermé : aucune référence ne vise un id absent', async () => {
    await suggerer({ data: undefined, isLoading: false, isFetching: false });
    const { container } = monter(<SearchAutocomplete />);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(referencesPendantes(container)).toEqual([]);
  });

  it('prérempli par l’URL, fermé : aucune référence pendante', async () => {
    await suggerer({ data: suggestions, isLoading: false, isFetching: false });
    const { container } = monter(<SearchAutocomplete value="dakar" />);
    expect(referencesPendantes(container)).toEqual([]);
  });

  it('ouvert avec résultats, suggestion active : la liste et l’option visées existent', async () => {
    await suggerer({ data: suggestions, isLoading: false, isFetching: false });
    const { container } = monter(<SearchAutocomplete />);
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'da');
    fireEvent.keyDown(champ, { key: 'ArrowDown' });

    expect(champ).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(champ).toHaveAttribute('aria-activedescendant');
    expect(referencesPendantes(container)).toEqual([]);
  });

  it('ouvert pendant un chargement, après une flèche : l’option active n’est pas rendue, rien ne la vise', async () => {
    await suggerer({ data: suggestions, isLoading: false, isFetching: false });
    const { container, rerender } = monter(<SearchAutocomplete />);
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'da');
    fireEvent.keyDown(champ, { key: 'ArrowDown' });

    await suggerer({ data: suggestions, isLoading: false, isFetching: true });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="fr" messages={frMessages}><SearchAutocomplete /></NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(referencesPendantes(container)).toEqual([]);
  });

  it('refermé par Échap : la référence à la liste disparaît avec elle', async () => {
    await suggerer({ data: suggestions, isLoading: false, isFetching: false });
    const { container } = monter(<SearchAutocomplete />);
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'da');
    fireEvent.keyDown(champ, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(referencesPendantes(container)).toEqual([]);
  });
});

describe('SearchAutocomplete — motif combobox ARIA 1.2 et nom (P07.06)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('le combobox est l’input lui-même, nommé par le texte affiché, et dit s’il est déplié', async () => {
    await suggerer({ data: suggestions, isLoading: false, isFetching: false });
    monter(<SearchAutocomplete placeholder="Ville, quartier" />);

    const champ = screen.getByRole('combobox', { name: 'Ville, quartier' });
    expect(champ.tagName).toBe('INPUT');
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(champ).toHaveAttribute('aria-expanded', 'false');

    await userEvent.type(champ, 'da');
    expect(champ).toHaveAttribute('aria-expanded', 'true');
  });

  it('sans placeholder imposé, le nom est le placeholder par défaut', async () => {
    await suggerer({ data: undefined, isLoading: false, isFetching: false });
    monter(<SearchAutocomplete />);
    expect(screen.getByRole('combobox', { name: frMessages.search.suggest.placeholder })).toBeInTheDocument();
  });
});

describe('SearchAutocomplete — le focus se voit sur la pilule (P31.01, P07.06)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('variante hero : anneau plein au jeton `ring` quand le champ a le focus', async () => {
    await suggerer({ data: undefined, isLoading: false, isFetching: false });
    monter(<SearchAutocomplete />);
    const pilule = screen.getByRole('combobox').parentElement;
    expect(classesDe(pilule)).toContain('focus-within:ring-2');
    expect(classesDe(pilule)).toContain('focus-within:ring-ring');
  });

  it('variante navbar (fond sombre) : contour clair au jeton de l’encre de la barre', async () => {
    await suggerer({ data: undefined, isLoading: false, isFetching: false });
    monter(<SearchAutocomplete variant="navbar" />);
    const pilule = screen.getByRole('combobox').parentElement;
    expect(classesDe(pilule)).toContain('focus-within:outline-2');
    expect(classesDe(pilule)).toContain('focus-within:outline-primary-foreground');
  });
});
