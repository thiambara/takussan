/**
 * Un champ, un sens — TCK-439.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI EST ÉPROUVÉ, ET POURQUOI UN TEST PAR GESTE NE SUFFIT PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La navbar écrivait la même saisie sous DEUX clés : `q` par le bouton loupe, `city` par une puce
 * de catégorie. Chacun des deux chemins, éprouvé seul, était parfaitement cohérent — c'est
 * précisément ce qui a permis au défaut de vivre. Ces tests comparent donc **les URL des gestes
 * entre elles**, ce qu'aucun test d'un seul geste ne peut faire.
 *
 * ⚠ `next/link` est remplacé par un double FIDÈLE (il empêche l'action par défaut et demande la
 * navigation au routeur client), et c'est ce qui rend AC5 mesurable : jsdom ne recharge pas de
 * document, il ne peut donc pas montrer un rechargement. Ce que le double rend observable, c'est
 * la seule chose qui distingue les deux mondes — l'action par défaut du navigateur est-elle
 * empêchée, et le routeur client est-il sollicité. Un `<a href>` nu, lui, ne traverse pas le
 * double : il laisse `defaultPrevented` à `false` et ne pousse rien. C'est exactement l'état
 * d'avant ce ticket, et c'est ce qui fait rougir le test par ablation.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/fr',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, onClick, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a
      href={href}
      onClick={(e) => {
        // Ce que fait le vrai `next/link` : il empêche la navigation de document et confie la
        // suite au routeur client. Le rendu, lui, reste un `<a>` — ce n'est donc pas la balise
        // qui est éprouvée.
        e.preventDefault();
        onClick?.(e);
        push(href);
      }}
      {...reste}
    >
      {children}
    </a>
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
  return render(
    <QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>,
  );
}

const SAISIE = 'villa avec piscine';

/** Le champ de recherche du bandeau — celui dont les trois gestes partent. */
function champ() {
  return screen.getByRole('searchbox');
}

function derniereUrl(): string {
  const dernier = push.mock.calls.at(-1);
  expect(dernier, 'aucune navigation demandée').toBeDefined();
  return String(dernier![0]);
}

function parametres(url: string): URLSearchParams {
  return new URLSearchParams(url.split('?')[1] ?? '');
}

describe('Navbar — un champ, un sens (TCK-439)', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('AC1 — loupe, Entrée et puce de catégorie produisent la MÊME clé de filtre', async () => {
    const user = userEvent.setup();
    monter();

    await user.type(champ(), SAISIE);
    await user.click(screen.getByRole('button', { name: 'Lancer la recherche' }));
    const urlLoupe = derniereUrl();

    push.mockReset();
    await user.type(champ(), '{Enter}');
    const urlEntree = derniereUrl();

    push.mockReset();
    const [puceVilla] = screen.getAllByRole('button', { name: 'Villa' });
    await user.click(puceVilla!);
    const urlPuce = derniereUrl();

    // La clé, d'abord — c'est le défaut du ticket, et il tient en un mot.
    for (const [geste, url] of [['loupe', urlLoupe], ['Entrée', urlEntree], ['puce', urlPuce]] as const) {
      expect(parametres(url).get('q'), `${geste} : la saisie doit partir en q`).toBe(SAISIE);
      expect(parametres(url).get('city'), `${geste} : la saisie ne doit JAMAIS partir en city`).toBeNull();
    }

    // Puis les URL entre elles : loupe et Entrée sont le même geste sur le même champ, elles
    // doivent être identiques au caractère près. La puce ajoute `type`, et rien d'autre.
    expect(urlEntree).toBe(urlLoupe);
    expect(urlPuce).toBe(`${urlLoupe}&type=villa`);
  });

  it("AC2 — une puce de catégorie AJOUTE le type et conserve la recherche plein-texte", async () => {
    const user = userEvent.setup();
    monter();

    // Une saisie qui n'est PAS un nom de ville : c'est le cas que `city` rendait muet.
    await user.type(champ(), SAISIE);
    const [puceVilla] = screen.getAllByRole('button', { name: 'Villa' });
    await user.click(puceVilla!);

    const params = parametres(derniereUrl());
    expect(params.get('q')).toBe(SAISIE);
    expect(params.get('type')).toBe('villa');
    expect(params.get('city')).toBeNull();
    expect([...params.keys()].sort()).toEqual(['q', 'type']);
  });

  it('AC3 — après une puce, la requête part avec ses TERMES : le repli conjonctif reste atteignable', async () => {
    const user = userEvent.setup();
    monter();

    await user.type(champ(), SAISIE);
    const [puceVilla] = screen.getAllByRole('button', { name: 'Villa' });
    await user.click(puceVilla!);

    // TCK-338 raisonne sur les termes de `q` : sans `q`, il n'a ni quoi élargir ni quoi
    // étiqueter, et la recherche rend zéro résultat sans explication.
    const q = parametres(derniereUrl()).get('q');
    expect(q).not.toBeNull();
    expect(q!.trim().split(/\s+/).length).toBeGreaterThan(1);
  });

  it('AC5 — les liens du menu mobile ne rechargent pas le document', async () => {
    const user = userEvent.setup();
    monter();

    const evenements: MouseEvent[] = [];
    document.addEventListener('click', (e) => evenements.push(e as MouseEvent));

    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    const panneau = screen.getByRole('link', { name: 'Acheter' }).closest('div')!;

    push.mockReset();
    evenements.length = 0;
    await user.click(within(panneau).getByRole('link', { name: 'Acheter' }));

    // `defaultPrevented` est la seule chose qui sépare une navigation client d'un rechargement
    // de document — un `<a href>` nu laisse le navigateur suivre le lien.
    expect(evenements.at(-1)?.defaultPrevented, "l'action par défaut du navigateur n'est pas empêchée").toBe(true);
    // …et le routeur client a bien été sollicité, avec la langue courante.
    expect(push).toHaveBeenCalledWith('/fr/properties?contract_type=sale');
  });

  it("AC5 (suite) — « Vendre » mène à /publish, qui n'est PAS localisé", async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    push.mockReset();
    await user.click(screen.getByRole('link', { name: 'Vendre' }));

    // `/publish` est dans `SEGMENTS_NON_LOCALISES` : `LienLocalise` doit le laisser intact.
    expect(push).toHaveBeenCalledWith('/publish');
    // Et plus aucune entrée « Services » : la surface n'existe pas.
    expect(screen.queryByRole('link', { name: /services/i })).toBeNull();
  });
});
