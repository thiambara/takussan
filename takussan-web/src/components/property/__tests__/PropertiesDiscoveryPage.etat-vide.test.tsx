import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';

/**
 * TCK-558 — à zéro résultat, UN énoncé du résultat nul, et une issue par critère.
 *
 * Avant : le compteur disait « 0 biens trouvés » et, dessous, l'état vide « Aucun bien trouvé » —
 * la même affirmation deux fois — et la seule action offerte était « Effacer tous les filtres » :
 * tout retirer pour un seul critère fautif.
 *
 * Le retrait depuis l'état vide suit le chemin de la puce de la barre d'outils (`onRemoveFilter`
 * de la page) : c'est l'URL poussée qui en fait foi, valeurs multiples comprises.
 */

let parametres = new URLSearchParams();
const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => '/properties',
  useSearchParams: () => parametres,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

vi.mock('@/components/map', () => ({ PropertyMap: () => <div data-testid="carte" /> }));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));
// La VRAIE `SaveSearchButton` est rendue — l'AC4 la vise. Seule sa mutation est remplacée.
vi.mock('@/lib/queries/saved-searches', () => ({
  useCreateSavedSearchMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { PropertiesDiscoveryPage } from '../PropertiesDiscoveryPage';

const REPONSE_VIDE = {
  data: [],
  facets: {},
  meta: { total: 0, per_page: 30, current_page: 1, last_page: 1 },
};

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue(REPONSE_VIDE);
  push.mockReset();
  replace.mockReset();
});

/** Monte la page sur `qs` et attend l'état vide, c'est-à-dire la recherche retombée. */
async function monteAZero(qs: string) {
  parametres = new URLSearchParams(qs);
  render(withIntl(<PropertiesDiscoveryPage />));
  return waitFor(() => {
    const vide = document.querySelector('[data-etat="vide-recherche"]');
    expect(vide).not.toBeNull();
    return vide as HTMLElement;
  });
}

/** L'URL qu'a poussée le dernier geste (push ou replace), en paramètres. */
function derniereUrl(): URLSearchParams {
  const appels = [...push.mock.calls, ...replace.mock.calls];
  expect(appels.length, 'aucune navigation après le retrait').toBeGreaterThan(0);
  const url = String(appels[appels.length - 1][0]);
  return new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?')) : '');
}

describe('TCK-558 — un seul énoncé du résultat nul (AC1)', () => {
  it('« 0 » et « aucun bien » n’apparaissent, ensemble, qu’une fois dans `main`', async () => {
    await monteAZero('q=zzzqqq&contract_type=rent');
    const texte = document.querySelector('main')!.textContent ?? '';
    const zeros = texte.match(/(^|[^\d])0(?!\d)/g) ?? [];
    const aucunBien = texte.match(/aucun bien/gi) ?? [];
    expect(zeros.length + aucunBien.length, texte).toBe(1);
  });

  it('le compteur l’énonce en français correct, pas « 0 biens trouvés »', async () => {
    await monteAZero('q=zzzqqq&contract_type=rent');
    expect(screen.queryByText(/0 biens? trouvés?/)).not.toBeInTheDocument();
    const compteur = document.querySelector('main p[aria-live]');
    expect(compteur).toHaveTextContent('Aucun bien trouvé');
  });

  it('l’état vide ne répète pas le constat : son titre dit quoi faire', async () => {
    const vide = await monteAZero('q=zzzqqq&contract_type=rent');
    const titre = within(vide).getByRole('heading', { level: 2 });
    expect(titre.textContent).not.toMatch(/aucun|0/i);
  });
});

describe('TCK-558 — chaque filtre actif se retire seul depuis l’état vide (AC2, AC3)', () => {
  it('propose deux retraits distincts, et retirer `zzzqqq` garde `contract_type=rent`', async () => {
    const vide = await monteAZero('q=zzzqqq&contract_type=rent');
    const retraits = within(vide).getAllByRole('button', { name: /zzzqqq|en location/i });
    expect(retraits).toHaveLength(2);

    await userEvent.click(within(vide).getByRole('button', { name: /zzzqqq/ }));
    const url = derniereUrl();
    expect(url.get('contract_type')).toBe('rent');
    expect(url.has('q')).toBe(false);
  });

  it('valeurs multiples : retirer « Villa » laisse `type=house` et `q=zzzqqq`', async () => {
    const vide = await monteAZero('q=zzzqqq&type=villa,house');
    await userEvent.click(within(vide).getByRole('button', { name: /^villa/i }));
    const url = derniereUrl();
    expect(url.get('type')).toBe('house');
    expect(url.get('q')).toBe('zzzqqq');
  });

  it('valeurs multiples, seconde clé : retirer une `condition` garde l’autre', async () => {
    const vide = await monteAZero('condition=new,off_plan&furnished=true');
    const puces = within(vide).getAllByRole('button').filter((b) => b.closest('[data-rangee="puces"]'));
    // `condition` éclatée en deux puces + `furnished`.
    expect(puces).toHaveLength(3);
    await userEvent.click(within(vide).getByRole('button', { name: /^neuf/i }));
    const url = derniereUrl();
    expect(url.get('furnished')).toBe('true');
    expect(url.get('condition')).toBe('off_plan');
  });

  it('les puces ne sont pas rendues DEUX fois : la barre d’outils n’en porte plus à zéro résultat', async () => {
    const vide = await monteAZero('q=zzzqqq&contract_type=rent');
    const rangees = [...document.querySelectorAll('[data-rangee="puces"]')];
    expect(rangees).toHaveLength(1);
    expect(vide.contains(rangees[0])).toBe(true);
  });
});

describe('TCK-558 — « Tout effacer » en second, la sauvegarde proposée (AC4)', () => {
  it('la sauvegarde est dans l’état vide, active ; elle n’est rendue qu’une fois dans la page', async () => {
    const vide = await monteAZero('q=zzzqqq&contract_type=rent');
    const sauver = within(vide).getByRole('button', { name: /sauvegarder la recherche/i });
    expect(sauver).not.toBeDisabled();
    expect(screen.getAllByRole('button', { name: /sauvegarder la recherche/i })).toHaveLength(1);
  });

  it('« Effacer tous les filtres » reste offert, APRÈS la sauvegarde et en style secondaire', async () => {
    const vide = await monteAZero('q=zzzqqq&contract_type=rent');
    const sauver = within(vide).getByRole('button', { name: /sauvegarder la recherche/i });
    const effacer = within(vide).getByRole('button', { name: /effacer tous les filtres/i });
    expect(sauver.compareDocumentPosition(effacer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(effacer.className).not.toMatch(/(^|\s)bg-primary(\s|$)/);

    await userEvent.click(effacer);
    const appels = [...push.mock.calls, ...replace.mock.calls];
    expect(String(appels[appels.length - 1][0])).toBe('/properties');
  });

  it('sans aucun filtre, l’état vide ne propose ni puce ni sauvegarde, mais garde « tout effacer »', async () => {
    // `page` au-delà de la dernière : un contrôle, pas un filtre — rien à retirer un à un.
    const vide = await monteAZero('page=3');
    expect(vide.querySelector('[data-rangee="puces"]')).toBeNull();
    expect(within(vide).queryByRole('button', { name: /sauvegarder la recherche/i })).toBeNull();
    expect(within(vide).getByRole('button', { name: /effacer tous les filtres/i })).toBeInTheDocument();
  });
});
