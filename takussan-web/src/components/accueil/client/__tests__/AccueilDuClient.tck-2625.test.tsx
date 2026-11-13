import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { VosRecherches } from '../VosRecherches';
import { VosVisites, type VisiteAVenir } from '../VosVisites';

/** TCK-2625 — les blocs du client : ses visites (servies par le tableau de bord) et ses recherches. */
const reseau = vi.hoisted(() => ({
  appels: [] as string[],
  recherches: [] as unknown[],
  nouveaux: {} as Record<string, number>,
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 5, roles: ['customer'] }, token: 'jeton' }) }));

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string) => {
      const lu = decodeURIComponent(path);
      reseau.appels.push(lu);
      if (lu.startsWith('/api/saved-searches')) return { data: reseau.recherches };
      if (lu.startsWith('/api/public/properties/search')) {
        const cle = Object.keys(reseau.nouveaux).find((k) => lu.includes(k));
        return { data: [], meta: { total: cle ? reseau.nouveaux[cle] : 0 } };
      }
      throw new Error(`requête inattendue : ${lu}`);
    }),
  };
});

function monter(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

const VISITES: VisiteAVenir[] = [
  { id: 11, scheduled_at: '2026-11-12T10:00:00Z', status: 'confirmed', property: { id: 3, title: 'Studio meublé à Mermoz' } },
  { id: 12, scheduled_at: '2026-11-14T15:00:00Z', status: 'scheduled', property: { id: 4, title: 'Deux-pièces au Point E' } },
  { id: 13, scheduled_at: '2026-11-20T09:00:00Z', status: 'scheduled', property: { id: 5, title: 'Villa à Ngor' } },
];

describe('Accueil du client — TCK-2625', () => {
  beforeEach(() => {
    reseau.appels = [];
    reseau.recherches = [];
    reseau.nouveaux = {};
  });

  it('« Vos démarches » : deux visites en cartes (date, bien, état), « Voir la visite », puis « Toutes vos visites »', () => {
    monter(<VosVisites visites={VISITES} />);
    const cartes = [...document.querySelectorAll<HTMLElement>('[data-slot="carte-de-visite-client"]')];
    expect(cartes).toHaveLength(2);
    expect(within(cartes[0]).getByText(/jeu\. 12 nov\. · 10:00/i)).toBeTruthy();
    expect(within(cartes[0]).getByText('Studio meublé à Mermoz')).toBeTruthy();
    expect(within(cartes[0]).getByText('Confirmée')).toBeTruthy();
    expect(within(cartes[1]).getByText('En attente de confirmation')).toBeTruthy();
    expect(within(cartes[0]).getByRole('link', { name: 'Voir la visite' }).getAttribute('href')).toBe('/app/visits/11');
    expect(screen.getByRole('link', { name: 'Toutes vos visites' }).getAttribute('href')).toBe('/app/visits');
    expect(document.body.textContent).not.toContain('Villa à Ngor');
  });

  it('sans visite, le bloc ne rend rien', () => {
    const { container } = monter(<VosVisites visites={[]} />);
    expect(container.querySelector('[data-slot="vos-visites"]')).toBeNull();
  });

  it('« Vos recherches » : le nom, la ligne courte (plafond, canal servi par l’API), « 3 nouveaux » ; celle qui a des nouveautés passe devant', async () => {
    reseau.recherches = [
      { id: 1, user_id: 5, name: 'Villa à Ngor', criteria: { city: 'Ngor' }, notification_frequency: 'off', is_active: true, results_count: null, alert_channels: [], last_viewed_at: '2026-11-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z' },
      { id: 2, user_id: 5, name: 'Studio à Mermoz', criteria: { city: 'Mermoz', price_max: 200000 }, notification_frequency: 'daily', is_active: true, results_count: null, alert_channels: ['inapp', 'whatsapp'], last_viewed_at: '2026-11-02T00:00:00Z', created_at: '2026-10-01T00:00:00Z' },
    ];
    reseau.nouveaux = { Mermoz: 3 };
    monter(<VosRecherches />);
    const pastille = await screen.findByText('3 nouveaux');
    const lignes = [...document.querySelectorAll<HTMLElement>('[data-slot="ligne-de-recherche"]')];
    expect(within(lignes[0]).getByText('Studio à Mermoz')).toBeTruthy();
    expect(lignes[0].contains(pastille)).toBe(true);
    expect(within(lignes[1]).queryByText(/nouveau/)).toBeNull();
    // La maquette : « Moins de 200 000 F · alerte WhatsApp » ; une alerte coupée le dit.
    expect(lignes[0].textContent?.replace(/\s/g, ' ')).toContain('Moins de 200 000 F · alerte WhatsApp');
    expect(within(lignes[1]).getByText('alerte coupée')).toBeTruthy();
    expect(reseau.appels.filter((a) => a.startsWith('/api/public/properties/search'))).toHaveLength(2);
  });

  it('sans recherche sauvegardée, le bloc ne rend rien', async () => {
    const { container } = monter(<VosRecherches />);
    await waitFor(() => expect(reseau.appels.some((a) => a.startsWith('/api/saved-searches'))).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-slot="vos-recherches"]')).toBeNull();
  });
});
