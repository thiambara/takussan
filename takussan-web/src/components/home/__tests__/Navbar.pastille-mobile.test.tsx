/**
 * TCK-549 — la pastille de recherche mobile ouvre une SAISIE, et résume la recherche en vigueur.
 *
 * Mesuré le 2026-09-22 (audit N1, N2, N4) : la pastille était un `<button>` dont le `onClick`
 * relançait la recherche courante. Sur `?contract_type=rent&q=Dakar&page=2`, un tap renvoyait en
 * page 1 sans qu'aucun champ n'apparaisse ; elle montrait l'invite même sous `q=Dakar` ; et la
 * seule saisie texte du mobile vivait dans le menu burger, à côté d'une bascule « Acheter /
 * Louer » qui contredisait le lien « Louer » marqué `aria-current`.
 *
 * Ce que ces tests éprouvent n'est pas la présence d'un champ, c'est ce que le geste fait À L'URL :
 * ouvrir puis fermer ne pousse RIEN (ni `page`, ni aucun filtre), valider pousse `q` sans `page`
 * en gardant le reste. C'est `push` qui est observé — un double de routeur qui n'est jamais appelé
 * est la seule preuve qu'une URL n'a pas bougé.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl, type LocaleDeTest } from '@/test/intl';

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

function monter(locale: LocaleDeTest = 'fr') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>{withIntl(<Navbar />, locale)}</QueryClientProvider>,
  );
}

/**
 * La pastille : le bouton de la barre qui annonce ouvrir une boîte de dialogue ET dont le nom
 * est son texte visible. Les deux déclencheurs de favoris ouvrent aussi un `dialog`, mais sont
 * nommés par `aria-label` — la pastille, elle, doit se nommer par ce qu'elle affiche.
 */
function pastille(): HTMLElement {
  const candidates = screen
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-haspopup') === 'dialog' && !b.hasAttribute('aria-label'));
  expect(candidates, 'une et une seule pastille qui ouvre une saisie').toHaveLength(1);
  return candidates[0]!;
}

function parametres(url: string): URLSearchParams {
  return new URLSearchParams(url.split('?')[1] ?? '');
}

describe('Pastille mobile — un tap ouvre une saisie (TCK-549 AC1)', () => {
  beforeEach(() => {
    push.mockReset();
    parametresUrl = new URLSearchParams('q=Dakar&page=2');
    chemin = '/fr/properties';
  });

  it('le tap ouvre une boîte de dialogue, focus dans un champ TEXTE pré-rempli par `q`, sans naviguer', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(pastille());

    const dialogue = await screen.findByRole('dialog');
    const champ = within(dialogue).getByRole('searchbox');
    expect(champ).toHaveAttribute('type', 'text');
    expect(champ).toHaveValue('Dakar');
    await waitFor(() => expect(champ).toHaveFocus());
    // Le défaut du ticket tient ici : le tap relançait la recherche et perdait `page=2`.
    expect(push).not.toHaveBeenCalled();
  });

  it('fermer par « Retour » sans valider ne touche pas à l’URL', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(pastille());
    const dialogue = await screen.findByRole('dialog');
    await user.type(within(dialogue).getByRole('searchbox'), ' Plateau');
    await user.click(within(dialogue).getByRole('button', { name: 'Retour' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(push).not.toHaveBeenCalled();
  });

  it('fermer par Échap sans valider ne touche pas à l’URL', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(pastille());
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(push).not.toHaveBeenCalled();
  });
});

describe('Pastille mobile — valider écrit `q`, garde les filtres, retire `page` (TCK-549 AC2)', () => {
  beforeEach(() => {
    push.mockReset();
    parametresUrl = new URLSearchParams('q=Dakar&contract_type=rent&type=villa&bedrooms_min=3&page=2');
    chemin = '/fr/properties';
  });

  it('Entrée dans le champ mène à `q=Almadies`, sans `page`, filtres conservés — et referme la saisie', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(pastille());
    const dialogue = await screen.findByRole('dialog');
    const champ = within(dialogue).getByRole('searchbox');
    await user.clear(champ);
    await user.type(champ, 'Almadies{Enter}');

    expect(push).toHaveBeenCalledTimes(1);
    const url = String(push.mock.calls[0]![0]);
    expect(url.startsWith('/fr/properties?')).toBe(true);
    const p = parametres(url);
    expect(p.get('q')).toBe('Almadies');
    expect(p.get('page')).toBeNull();
    expect(p.get('contract_type')).toBe('rent');
    expect(p.get('type')).toBe('villa');
    expect(p.get('bedrooms_min')).toBe('3');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('le bouton « Rechercher » de la saisie produit la MÊME URL que la touche Entrée', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(pastille());
    let dialogue = await screen.findByRole('dialog');
    await user.clear(within(dialogue).getByRole('searchbox'));
    await user.type(within(dialogue).getByRole('searchbox'), 'Almadies{Enter}');
    const urlEntree = String(push.mock.calls.at(-1)![0]);

    push.mockReset();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(pastille());
    dialogue = await screen.findByRole('dialog');
    await user.clear(within(dialogue).getByRole('searchbox'));
    await user.type(within(dialogue).getByRole('searchbox'), 'Almadies');
    await user.click(within(dialogue).getByRole('button', { name: 'Rechercher' }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(String(push.mock.calls[0]![0])).toBe(urlEntree);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Pastille mobile — elle résume la recherche en vigueur (TCK-549 AC3, AC4)', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('sous `q=Dakar&contract_type=rent`, elle montre « Dakar » et la transaction, pas l’invite', () => {
    parametresUrl = new URLSearchParams('q=Dakar&contract_type=rent');
    chemin = '/fr/properties';
    monter();

    const texte = pastille().textContent ?? '';
    expect(texte).toContain('Dakar');
    expect(texte).toContain('À louer');
    expect(texte).not.toContain('Où cherchez-vous');
    expect(texte).not.toContain('Chercher');
  });

  it('sous `contract_type=sale` seul, elle garde le libellé court et ajoute la transaction', () => {
    parametresUrl = new URLSearchParams('contract_type=sale');
    chemin = '/fr/properties';
    monter();

    expect(pastille()).toHaveTextContent('Chercher');
    expect(pastille()).toHaveTextContent('À vendre');
  });

  it('sans recherche active, elle porte le libellé court — dans les trois langues', () => {
    parametresUrl = new URLSearchParams();
    chemin = '/fr/properties';
    const attendus: Record<LocaleDeTest, string> = { fr: 'Chercher', en: 'Search', wo: 'Seet' };
    for (const locale of ['fr', 'en', 'wo'] as const) {
      const { unmount } = monter(locale);
      expect(pastille().textContent).toBe(attendus[locale]);
      unmount();
    }
  });

  it('hors de la liste des biens, le `q` d’un autre index ne s’affiche pas dans la pastille', () => {
    parametresUrl = new URLSearchParams('q=diallo&contract_type=rent');
    chemin = '/fr/agencies';
    monter();

    expect(pastille().textContent).toBe('Chercher');
  });
});

describe('Menu mobile — une seule surface de saisie (TCK-549 AC5)', () => {
  it('le menu ouvert ne porte plus ni champ, ni bascule « Acheter / Louer »', async () => {
    push.mockReset();
    parametresUrl = new URLSearchParams('contract_type=rent');
    chemin = '/fr/properties';
    const user = userEvent.setup();
    const { container } = monter();

    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    const panneau = container.querySelector('nav > div.absolute');
    expect(panneau, 'le panneau du menu est ouvert').not.toBeNull();

    expect(panneau!.querySelectorAll('[aria-pressed]')).toHaveLength(0);
    expect(panneau!.querySelectorAll('input')).toHaveLength(0);
    // Le lien de navigation, lui, reste — et reste le seul à dire où l'on est.
    expect(within(panneau as HTMLElement).getByRole('link', { name: 'Louer' })).toHaveAttribute('aria-current', 'page');
  });
});
