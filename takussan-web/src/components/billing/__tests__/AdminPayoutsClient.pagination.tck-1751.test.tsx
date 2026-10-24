/**
 * TCK-1751 (P171.07) — les versements et les annonces de la console se paginent par le composant
 * `Pagination` de la console, 30 par page.
 *
 * Avant : une seule page de 30, et le total de l'API affiché au-dessus : la 31ᵉ ligne ne
 * s'atteignait pas. L'API est bouchonnée au niveau des lecteurs (`fetchAdminPlatformPayouts`,
 * `fetchAdminAnnouncements`), qui acceptent déjà `page`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { fetchAdminAgencies, fetchAdminAnnouncements, fetchAdminPlatformPayouts } from '@/lib/queries/super-admin';
import type { Announcement, PlatformPayout } from '@/types/super-admin';

vi.mock('@/lib/queries/super-admin', () => ({
  createAdminAnnouncement: vi.fn(),
  deactivateAdminAnnouncement: vi.fn(),
  fetchAdminAgencies: vi.fn(),
  fetchAdminAnnouncements: vi.fn(),
  patchAdminAnnouncement: vi.fn(),
  fetchAdminPlatformPayouts: vi.fn(),
}));
vi.mock('@/components/admin/super/AgencyCombobox', () => ({
  AgencyCombobox: ({ onChange }: { onChange: (v: string) => void }) => (
    <button type="button" onClick={() => onChange('5')}>agence 5</button>
  ),
}));
vi.mock('../PayoutCloseDialog', () => ({ PayoutCloseDialog: () => null }));
vi.mock('../PayoutDetailPanel', () => ({ PayoutDetailPanel: () => null }));

import { AdminPayoutsClient } from '../AdminPayoutsClient';
import { AnnouncementsConsole } from '@/components/admin/super/announcements';

function paginer<T>(lignes: T[], page = 1) {
  return {
    data: lignes.slice((page - 1) * 30, page * 30),
    meta: { total: lignes.length, current_page: page, last_page: Math.ceil(lignes.length / 30), per_page: 30 },
  };
}

const versements: PlatformPayout[] = Array.from({ length: 31 }, (_, i) => ({
  id: i + 1,
  agency_id: 1001 + i,
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  gross_amount: 1000,
  platform_fee_amount: 100,
  net_amount: 900,
  currency: 'XOF',
  status: 'pending',
  approved_by: null,
  processed_at: null,
  failure_reason: null,
  metadata: null,
  created_at: null,
  updated_at: null,
}));

const annonces: Announcement[] = Array.from({ length: 31 }, (_, i) => ({
  id: i + 1,
  title: { fr: `Annonce ${i + 1}`, en: `Notice ${i + 1}`, wo: `Annonce ${i + 1}` },
  body: { fr: 'Corps', en: 'Body', wo: 'Corps' },
  severity: 'info',
  segment: {},
  starts_at: '2026-08-01T08:00:00.000000Z',
  ends_at: null,
  is_active: false,
  created_by: 1,
  created_at: '2026-08-01T08:00:00.000000Z',
  updated_at: '2026-08-01T08:00:00.000000Z',
}));

function rendre(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchAdminPlatformPayouts).mockImplementation(async ({ page } = {}) => paginer(versements, page ?? 1));
  vi.mocked(fetchAdminAnnouncements).mockImplementation(async ({ page } = {}) => paginer(annonces, page ?? 1) as never);
  vi.mocked(fetchAdminAgencies).mockResolvedValue({ data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 100 } } as never);
});

describe('TCK-1751 — versements et annonces de la console se paginent', () => {
  it('le 31ᵉ versement se rend en page 2, et changer d’agence ramène en page 1', async () => {
    const user = userEvent.setup();
    rendre(<AdminPayoutsClient />);

    expect(await screen.findByText('#1001')).toBeInTheDocument();
    expect(screen.queryByText('#1031')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Suivant/ }));
    expect(await screen.findByText('#1031')).toBeInTheDocument();
    expect(vi.mocked(fetchAdminPlatformPayouts)).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, perPage: 30 }));

    await user.click(screen.getByRole('button', { name: 'agence 5' }));
    expect(vi.mocked(fetchAdminPlatformPayouts)).toHaveBeenLastCalledWith(expect.objectContaining({ agencyId: 5, page: 1 }));
  });

  it('la 31ᵉ annonce se rend en page 2', async () => {
    const user = userEvent.setup();
    rendre(<AnnouncementsConsole />);

    expect(await screen.findByText('Annonce 1')).toBeInTheDocument();
    expect(screen.queryByText('Annonce 31')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Suivant/ }));
    expect(await screen.findByText('Annonce 31')).toBeInTheDocument();
    expect(vi.mocked(fetchAdminAnnouncements)).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, perPage: 30 }));
  });
});

describe('TCK-2078 (P196.01) — la console ne propose que les statuts que l’API pose', () => {
  it('le filtre de statut n’offre ni « En cours » ni « Échec », cas réservés', async () => {
    const user = userEvent.setup();
    rendre(<AdminPayoutsClient />);
    await screen.findByText('#1001');

    await user.click(screen.getByRole('combobox', { name: 'Filtrer par statut' }));
    const liste = await screen.findByRole('listbox');
    const libelles = within(liste).getAllByRole('option').map((o) => o.textContent);

    expect(libelles).toEqual(expect.arrayContaining(['En attente', 'Approuvé', 'Payé', 'Annulé']));
    expect(libelles).not.toContain('En cours');
    expect(libelles).not.toContain('Échec');
  });
});
