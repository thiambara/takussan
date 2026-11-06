import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { DELAI_D_ENVOI_MS, PreferencesDuMenuProvider } from '@/components/layout/PreferencesDuMenu';
import type { ModeIcones } from '@/lib/navigation/mode-icones';
import { ProfileMenuSection } from '../ProfileMenuSection';

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  // Le cookie du mode est posé en `path=/app` : jsdom ne le relit que depuis une URL sous `/app`.
  window.history.replaceState(null, '', '/app/profile');
  document.cookie = 'menu_icones=; path=/app; max-age=0';
});
afterEach(() => vi.unstubAllGlobals());

function rendre(navigation?: unknown, modeIcones: ModeIcones = 'auto') {
  render(
    withIntl(
      <ToastProvider>
        <PreferencesDuMenuProvider navigationInitiale={navigation} persona="agent" modeIconesInitial={modeIcones}>
          <ProfileMenuSection />
        </PreferencesDuMenuProvider>
      </ToastProvider>,
    ),
  );
}

describe('ProfileMenuSection — TCK-2480', () => {
  it('revenir au menu par défaut efface le persona ACTIF, et lui seul', async () => {
    const user = userEvent.setup();
    rendre({ v: 1, personas: { agent: { epingles: ['commissions'] }, bailleur: { replies: ['activite'] } } });
    expect(screen.getByText(/menu « Agent »/)).toBeInTheDocument();
    expect(screen.getByText('Votre menu est personnalisé.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revenir au menu par défaut' }));
    expect(screen.getByText('Votre menu suit la disposition par défaut.')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: DELAI_D_ENVOI_MS + 1000 });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      navigation: { v: 1, personas: { bailleur: { replies: ['activite'] } } },
    });
  });

  it('A9 — « Démarrer » masqué seul compte comme personnalisé, et se rétablit avec le reste', async () => {
    const user = userEvent.setup();
    rendre({ v: 1, personas: { agent: { demarrer_masque: true, replies: ['gestion'] } } });
    await user.click(screen.getByRole('button', { name: 'Revenir au menu par défaut' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: DELAI_D_ENVOI_MS + 1000 });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ navigation: null });
  });

  it('un menu déjà par défaut : le bouton est inactif', () => {
    rendre();
    expect(screen.getByRole('button', { name: 'Revenir au menu par défaut' })).toBeDisabled();
    expect(screen.getByText('Votre menu suit la disposition par défaut.')).toBeInTheDocument();
  });

  it('A10 — la barre de cet appareil : les trois choix ; « Automatique » efface le cookie', async () => {
    const user = userEvent.setup();
    document.cookie = 'menu_icones=1; path=/app';
    rendre(undefined, 'icones');
    const choix = screen.getByRole('combobox', { name: 'Barre latérale sur cet appareil' });
    expect(choix).toHaveTextContent('Toujours réduite aux icônes');
    await user.click(choix);
    expect(await screen.findByRole('option', { name: 'Toujours complète' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /^Automatique/ }));
    await waitFor(() => expect(choix).toHaveTextContent(/^Automatique/));
    expect(document.cookie).not.toContain('menu_icones=');
    // Aucune écriture sur le compte : c'est un réglage de l'appareil.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('A10 — choisir « Toujours complète » pose `menu_icones=0`', async () => {
    const user = userEvent.setup();
    rendre();
    await user.click(screen.getByRole('combobox', { name: 'Barre latérale sur cet appareil' }));
    await user.click(await screen.findByRole('option', { name: 'Toujours complète' }));
    await waitFor(() => expect(document.cookie).toContain('menu_icones=0'));
  });

  it('sans fournisseur, rien ne se rend', () => {
    const { container } = render(withIntl(<ProfileMenuSection />));
    expect(container).toBeEmptyDOMElement();
  });
});
