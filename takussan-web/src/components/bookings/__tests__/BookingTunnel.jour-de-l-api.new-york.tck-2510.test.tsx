/**
 * TCK-2510 — le premier jour d'arrivée possible est le jour de l'API (UTC = Africa/Dakar), pas le jour
 * local du navigateur : l'API refuse une arrivée « hier » à son heure. Navigateur à America/New_York, fixé AVANT
 * toute date ; horloge à 2026-12-02T02:00:00Z, où le jour local et celui de l'API diffèrent (cf. P212.02).
 */
process.env.TZ = 'America/New_York';

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';
import { BookingTunnel } from '../BookingTunnel';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, isLoading: false, openSession: vi.fn() }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/queries/bookings', () => ({ useCreateBooking: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
// Une référence STABLE, comme l'état du vrai hook : un tableau neuf à chaque rendu relancerait la vérification.
const nuits = vi.hoisted(() => ({ plages: [], etat: 'pret' as const }));
vi.mock('../useNuitsPrises', () => ({ useNuitsPrises: () => nuits }));
vi.mock('@/lib/connexion-telephone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connexion-telephone')>()),
  connexionParTelephoneActive: async () => false,
}));

const bien = {
  id: 7, slug: 'bien-7', title: 'Studio', price: 20_000, currency: 'XOF', contract_type: 'rent', rent_period: 'daily',
  rent_period_label: null, main_photo_url: null, location: { city: 'Dakar' }, owner: null, primary_contact: null,
} as unknown as PropertyDetail;

const jour = (j: string) => document.querySelector<HTMLButtonElement>(`[data-jour="${j}"]`)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-02T02:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('TCK-2510 — jour de l’API, navigateur à America/New_York', () => {
  it('le 2026-12-02 (jour de l’API) est la première arrivée possible ; le 2026-12-01 ne l’est pas', () => {
    expect(new Date().toLocaleDateString('sv-SE')).not.toBe('2026-12-02'); // le décor : les deux jours diffèrent bien
    render(withIntl(<BookingTunnel property={bien} />));
    expect(jour('2026-12-02')).toBeEnabled();
    // La veille est éteinte — ou hors de la grille, qui s'ouvre sur le mois de l'API.
    const veille = document.querySelector<HTMLButtonElement>('[data-jour="2026-12-01"]');
    expect(veille === null || veille.disabled).toBe(true);
  });
});
