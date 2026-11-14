/**
 * TCK-2792 — le titre d'une visite dans les cartes « du jour » et « demande » (téléphone) est un lien ÉTIRÉ sur
 * la tête de la carte : l'heure ou la date, le titre, l'adresse et le visiteur. Les gestes (Itinéraire, Appeler,
 * WhatsApp, « Autre heure », « Confirmer ») restent hors de la zone.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { attendreLienEtire } from '@/test/lien-etire';
import { withIntl } from '@/test/intl';
import type { PropertyVisit } from '@/types/visit';

import { CarteDemande, CarteDuJour } from '../cartes';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, roles: ['agent'], agency_id: 3 }, token: 'jeton' }) }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: async () => ({ data: [] }),
}));

const VISITE = {
  id: 41,
  property_id: 51,
  status: 'confirmed',
  type: 'in_person',
  scheduled_at: '2026-11-13T10:30:00Z',
  duration_minutes: 30,
  agent_id: 3,
  agent: { id: 3, first_name: 'Sokhna', last_name: 'Sène' },
  property: { id: 51, title: 'Local commercial', slug: 'local-commercial', cover_url: null, address: { line: 'Rue 10', neighborhood: 'Plateau' } },
  visitor_display: { name: 'Mariama Fall', phone: '+221789429352', kind: 'customer', visits_on_property: 1 },
} as unknown as PropertyVisit;

function monter(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

/** Le titre de la carte : « Local commercial » (du jour), « Local commercial · Plateau » (demande, bien et quartier). */
const lienDuTitre = () => screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/app/visits/41' && a.textContent?.startsWith('Local commercial')) as HTMLElement;

describe('TCK-2792 — les cartes de visites : le titre, lien étiré sur la tête', () => {
  it('« du jour » : la zone est la tête (heure, durée, adresse, visiteur), sans Itinéraire, Appeler ni WhatsApp', () => {
    monter(<CarteDuJour v={VISITE} />);
    const lien = lienDuTitre();
    const carte = lien.closest<HTMLElement>('[data-slot="carte-du-jour"]') as HTMLElement;
    const gestes = [...carte.querySelectorAll<HTMLElement>('a[href], button')].filter((g) => g !== lien);
    expect(gestes.length).toBeGreaterThanOrEqual(2);
    const zone = attendreLienEtire(lien, { carte, temoins: [screen.getByText('Mariama Fall'), screen.getByText(/Rue 10/)], gestes });
    expect(zone.textContent).toMatch(/\d{2}:\d{2}/);
  });

  it('« demande » : la zone est la tête (date, heure, bien, visiteur), sans « Autre heure » ni « Confirmer »', () => {
    monter(<CarteDemande v={VISITE} gestes={{ onConfirmer: () => {}, onVerdict: () => {}, onAbsent: () => {}, enCours: null }} />);
    const lien = lienDuTitre();
    const carte = lien.closest<HTMLElement>('[data-slot="carte-demande"]') as HTMLElement;
    const gestes = [...carte.querySelectorAll<HTMLElement>('a[href], button')].filter((g) => g !== lien);
    expect(gestes.length).toBeGreaterThanOrEqual(1);
    const zone = attendreLienEtire(lien, { carte, temoins: [screen.getByText(/Mariama Fall/)], gestes });
    expect(zone.textContent).toMatch(/\d{2}:\d{2}/);
  });
});
