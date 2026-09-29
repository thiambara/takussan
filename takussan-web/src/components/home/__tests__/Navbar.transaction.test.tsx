/**
 * « Acheter | Louer » — le sélecteur segmenté de la barre publique (`Accueil.dc.html`).
 *
 * Il remplace un menu déroulant. Ce qui est éprouvé : le choix est un bouton à bascule lisible
 * (`aria-pressed`) ; un second appui le retire ; il part de la transaction EN VIGUEUR sur la liste ;
 * et il vaut pour TOUS les gestes qui lancent la recherche — la loupe, mais aussi Entrée dans le
 * champ, qui passait jusqu'ici par l'URL de `SearchAutocomplete` et partait sans lui.
 *
 * ⚠ jsdom n'anime rien : la glissade de la pastille se mesure au navigateur. Ce qui se voit ici,
 * c'est l'état que l'animation interpole — la pastille décalée sous « Louer », effacée sans choix.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

const push = vi.fn();
let parametresUrl = new URLSearchParams();
let chemin = '/fr';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => parametresUrl,
  usePathname: () => chemin,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
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

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>);
}

/** Le groupe de la barre de BUREAU (le premier dans l'arbre ; la saisie mobile est fermée). */
const groupe = () => screen.getByRole('group', { name: 'Acheter / Louer' });
const bouton = (nom: 'Acheter' | 'Louer') => within(groupe()).getByRole('button', { name: nom });
const pastille = () => groupe().querySelector<HTMLElement>('[data-slot="pastille"]')!;
const derniereUrl = () => String(push.mock.calls.at(-1)?.[0]);
const contrat = (url: string) => new URLSearchParams(url.split('?')[1] ?? '').get('contract_type');

describe('Navbar — « Acheter | Louer » segmenté', () => {
  beforeEach(() => {
    push.mockReset();
    parametresUrl = new URLSearchParams();
    chemin = '/fr';
  });

  it('remplace le menu déroulant : deux boutons à bascule, aucun choix au repos', () => {
    monter();
    expect(screen.queryByText('Acheter / Louer')).toBeNull(); // plus de valeur d'attente de menu
    expect(bouton('Acheter')).toHaveAttribute('aria-pressed', 'false');
    expect(bouton('Louer')).toHaveAttribute('aria-pressed', 'false');
    expect(pastille().className).toMatch(/opacity-0/);
  });

  it('choisir « Louer » presse le bouton et glisse la pastille ; un second appui le retire', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(bouton('Louer'));
    expect(bouton('Louer')).toHaveAttribute('aria-pressed', 'true');
    expect(bouton('Acheter')).toHaveAttribute('aria-pressed', 'false');
    expect(pastille().className).toMatch(/translate-x-full/);
    expect(pastille().className).not.toMatch(/opacity-0/);

    await user.click(bouton('Acheter'));
    expect(bouton('Acheter')).toHaveAttribute('aria-pressed', 'true');
    expect(pastille().className).not.toMatch(/translate-x-full/);

    await user.click(bouton('Acheter'));
    expect(bouton('Acheter')).toHaveAttribute('aria-pressed', 'false');
    expect(pastille().className).toMatch(/opacity-0/);
  });

  it('la loupe emporte le choix', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(bouton('Louer'));
    await user.click(screen.getByRole('button', { name: 'Lancer la recherche' }));
    expect(contrat(derniereUrl())).toBe('rent');
  });

  it('Entrée dans le champ l’emporte aussi — elle partait sans lui', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(bouton('Acheter'));
    await user.type(screen.getAllByRole('searchbox')[0], 'Almadies{Enter}');
    const url = derniereUrl();
    expect(new URLSearchParams(url.split('?')[1]).get('q')).toBe('Almadies');
    expect(contrat(url)).toBe('sale');
  });

  it('sur la liste, il part de la transaction en vigueur, et le retirer la retire de l’URL', async () => {
    const user = userEvent.setup();
    chemin = '/fr/properties';
    parametresUrl = new URLSearchParams('contract_type=rent&type=villa');
    monter();

    expect(bouton('Louer')).toHaveAttribute('aria-pressed', 'true');

    await user.click(bouton('Louer'));
    await user.click(screen.getByRole('button', { name: 'Lancer la recherche' }));
    const url = derniereUrl();
    expect(contrat(url)).toBeNull();
    expect(new URLSearchParams(url.split('?')[1]).get('type')).toBe('villa');
  });

  it('le libellé en gras est réservé : la colonne ne change pas de largeur à la bascule', () => {
    monter();
    for (const nom of ['Acheter', 'Louer'] as const) {
      const reserve = bouton(nom).querySelector('[aria-hidden="true"]');
      expect(reserve?.textContent).toBe(nom);
      expect(reserve?.className).toMatch(/invisible/);
      expect(reserve?.className).toMatch(/font-semibold/);
    }
  });
});
