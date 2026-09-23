/**
 * TCK-550 — le choix de langue en contrôle segmenté, pour le menu mobile et le pied de page.
 *
 * Ce qui est éprouvé ici, c'est le CONTRAT du contrôle, indépendamment de l'endroit où il est
 * monté : trois choix nommés dans leur propre langue, la langue courante seule marquée, et un
 * changement qui suit la mécanique de `LanguageSwitcher` (ADR-0026 §5) — cookie écrit par
 * `setLocaleAction`, PUIS navigation vers le même chemin et la même requête sous l'autre préfixe.
 *
 * ⚠ La requête est lue sur `window.location.search` au clic, comme dans `LanguageSwitcher` : le
 * test la pose donc dans l'URL de jsdom, pas dans un `useSearchParams` simulé. Un contrôle qui
 * l'aurait lue ailleurs rougirait ici.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl, type LocaleDeTest } from '@/test/intl';

const appels: string[] = [];
const push = vi.fn((url: string) => { appels.push(`push ${url}`); });
const refresh = vi.fn(() => { appels.push('refresh'); });
let cheminCourant = '/fr/properties';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh, back: vi.fn() }),
  usePathname: () => cheminCourant,
  useSearchParams: () => new URLSearchParams(),
}));

const setLocaleAction = vi.fn(async (_l: string) => {});
vi.mock('@/app/actions/locale', () => ({
  setLocaleAction: (l: string) => setLocaleAction(l),
}));

const { ChoixDeLangue } = await import('@/components/shared/ChoixDeLangue');

function monter(locale: LocaleDeTest = 'fr') {
  return render(withIntl(<ChoixDeLangue />, locale));
}

function groupe(nom = 'Langue') {
  return screen.getByRole('group', { name: nom });
}

describe('ChoixDeLangue (TCK-550)', () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    appels.length = 0;
    setLocaleAction.mockClear();
    cheminCourant = '/fr/properties';
    window.history.replaceState(null, '', '/fr/properties');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('rend trois contrôles FR · EN · WO dans un groupe étiqueté, pas une liste déroulante', () => {
    monter();
    const boutons = within(groupe()).getAllByRole('button');
    expect(boutons.map((b) => b.textContent?.trim())).toEqual(['FR', 'EN', 'WO']);
    // Pas de menu déroulant : aucun déclencheur à popup, aucune liste d'options.
    expect(document.querySelector('[aria-haspopup]')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('nomme chaque langue dans sa propre langue, avec son attribut lang', () => {
    monter('en');
    const g = groupe('Language');
    for (const [nom, code] of [['Français', 'fr'], ['English', 'en'], ['Wolof', 'wo']] as const) {
      const bouton = within(g).getByRole('button', { name: nom });
      expect(bouton).toHaveAttribute('lang', code);
    }
  });

  it.each(['fr', 'en', 'wo'] as const)('la langue courante (%s) est la SEULE marquée', (locale) => {
    monter(locale);
    const boutons = within(screen.getByRole('group')).getAllByRole('button');
    const marques = boutons.filter((b) => b.getAttribute('aria-current') === 'true');
    expect(marques).toHaveLength(1);
    expect(marques[0]).toHaveAttribute('lang', locale);
    for (const b of boutons) {
      if (b !== marques[0]) expect(b).not.toHaveAttribute('aria-current');
    }
  });

  it('chaque contrôle porte une zone tactile de 44 px au moins (min-h-11)', () => {
    monter();
    for (const b of within(groupe()).getAllByRole('button')) {
      expect(b.className.split(/\s+/)).toContain('min-h-11');
    }
  });

  it('choisir WO conserve le chemin ET la requête : /fr/properties?type=villa&page=2 → /wo/…', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/fr/properties?type=villa&page=2');
    monter();

    await user.click(within(groupe()).getByRole('button', { name: 'Wolof' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/wo/properties?type=villa&page=2'));
    // La préférence suit le chemin déjà en place (cookie + PATCH /users/me si connecté).
    expect(setLocaleAction).toHaveBeenCalledWith('wo');
  });

  it("la racine est rafraîchie APRÈS la navigation — sans quoi `<html lang>` et la langue marquée restaient à l'ancienne", async () => {
    // Mesuré au navigateur (cf. le ticket) : le layout racine est partagé entre `/fr/…` et
    // `/wo/…`, la navigation douce ne le re-rend pas, et 2 changements sur 5 laissaient la page
    // en `lang="fr"` avec FR marqué, sur un contenu en wolof.
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/fr/properties?type=villa');
    monter();

    await user.click(within(groupe()).getByRole('button', { name: 'Wolof' }));

    await waitFor(() => expect(appels).toEqual(['push /wo/properties?type=villa', 'refresh']));
  });

  it('choisir la langue déjà courante ne fait rien', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(within(groupe()).getByRole('button', { name: 'Français' }));
    expect(setLocaleAction).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("hors de la surface localisée, seul le cookie change — aucune navigation vers une route inexistante", async () => {
    const user = userEvent.setup();
    cheminCourant = '/app/overview';
    window.history.replaceState(null, '', '/app/overview');
    monter();

    await user.click(within(groupe()).getByRole('button', { name: 'English' }));

    await waitFor(() => expect(setLocaleAction).toHaveBeenCalledWith('en'));
    expect(push).not.toHaveBeenCalled();
  });
});
