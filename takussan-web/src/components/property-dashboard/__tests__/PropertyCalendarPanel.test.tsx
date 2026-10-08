import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { PropertyCalendarPanel } from '../PropertyCalendarPanel';
import { PropertyDetailTabs } from '../PropertyDetailTabs';
import type { PropertyDetail } from '@/types/property';

/**
 * TCK-596 §3B (ADR-0041) — le calendrier d'hôte : les trois sources, le blocage d'une plage, les
 * flux importés et le lien d'export. Les données viennent des hooks, simulés : c'est l'écran qu'on
 * éprouve, l'API a ses propres tests.
 */
const etat = vi.hoisted(() => ({
  createBlock: vi.fn(),
  deleteBlock: vi.fn(),
  createFeed: vi.fn(),
  syncFeed: vi.fn(),
  deleteFeed: vi.fn(),
  generate: vi.fn(),
  blocks: [] as unknown[],
  feeds: [] as unknown[],
}));

const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutateAsync: fn, isPending: false });

vi.mock('@/lib/queries/property-calendar', () => ({
  usePropertyConfirmedStays: () => ({
    isLoading: false,
    data: { data: [{ id: 1, reference_number: 'BK-1', status: 'confirmed', start_date: '2026-11-10', end_date: '2026-11-13' }] },
  }),
  usePropertyUnavailabilities: () => ({ isLoading: false, data: { data: etat.blocks } }),
  useCalendarFeeds: () => ({ isLoading: false, data: { data: etat.feeds } }),
  useCreateUnavailability: () => mutation(etat.createBlock),
  useDeleteUnavailability: () => mutation(etat.deleteBlock),
  useCreateCalendarFeed: () => mutation(etat.createFeed),
  useSyncCalendarFeed: () => mutation(etat.syncFeed),
  useDeleteCalendarFeed: () => mutation(etat.deleteFeed),
  useGenerateIcalLink: () => mutation(etat.generate),
}));
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ value, onValueChange, placeholder }: { value?: string; onValueChange: (v: string) => void; placeholder?: string }) => (
    <input aria-label={placeholder} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
vi.mock('@/components/property-form', () => ({ PropertyForm: () => null }));
vi.mock('@/components/property-dashboard/PropertyMediaPanel', () => ({ PropertyMediaPanel: () => null }));
vi.mock('@/components/property-dashboard/PropertyOverviewPanel', () => ({ PropertyOverviewPanel: () => null }));

const MANUEL = {
  id: 11, property_id: 7, starts_on: '2026-12-01', ends_on: '2026-12-04', reason: 'Travaux',
  source: 'manual', calendar_feed_id: null, conflict_booking_id: null,
};
const IMPORTE = {
  id: 12, property_id: 7, starts_on: '2026-11-12', ends_on: '2026-11-14', reason: null,
  source: 'ical', calendar_feed_id: 3, feed_name: 'Airbnb', conflict_booking_id: 1,
};
const FLUX = {
  id: 3, property_id: 7, url_host: 'www.airbnb.com', label: 'Airbnb', last_synced_at: null,
  last_status: 'failed', last_error: 'http_error', failing_since: null, consecutive_failures: 3,
};

function monter() {
  render(withIntl(<PropertyCalendarPanel propertyId={7} />));
}

describe('PropertyCalendarPanel (TCK-596 §3B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    etat.blocks = [MANUEL, IMPORTE];
    etat.feeds = [FLUX];
    etat.createBlock.mockResolvedValue({ data: {} });
    etat.deleteBlock.mockResolvedValue(undefined);
    etat.syncFeed.mockResolvedValue({ data: {} });
    etat.generate.mockResolvedValue({ data: { url: 'https://api.takussan.com/ical/abc.ics' } });
  });

  it('liste les blocages : le manuel se débloque, l’importé non, et son conflit se voit', () => {
    monter();

    const liste = screen.getByTestId('calendar-blocks');
    const [manuel, importe] = within(liste).getAllByRole('listitem');
    expect(manuel).toHaveTextContent('Travaux');
    expect(within(manuel).getByRole('button', { name: 'Débloquer' })).toBeInTheDocument();
    expect(importe).toHaveTextContent('Importé de Airbnb');
    expect(importe).toHaveTextContent('Conflit avec une réservation');
    expect(within(importe).queryByRole('button', { name: 'Débloquer' })).not.toBeInTheDocument();

    fireEvent.click(within(manuel).getByRole('button', { name: 'Débloquer' }));
    expect(etat.deleteBlock).toHaveBeenCalledWith({ id: 11 });
  });

  it('bloque une plage, et affiche le refus de l’API tel qu’elle le dit', async () => {
    etat.createBlock.mockRejectedValueOnce(
      new ApiError(422, { message: 'Ces dates chevauchent une réservation confirmée.', code: 'unavailability.overlaps_booking' }),
    );
    monter();
    const form = screen.getByTestId('calendar-block-form');

    fireEvent.change(within(form).getByLabelText('Première nuit'), { target: { value: '2026-11-11' } });
    fireEvent.change(within(form).getByLabelText('Jour de reprise'), { target: { value: '2026-11-15' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Bloquer' }));

    await waitFor(() =>
      expect(etat.createBlock).toHaveBeenCalledWith({ starts_on: '2026-11-11', ends_on: '2026-11-15', reason: undefined }),
    );
    expect(await within(form).findByRole('alert')).toHaveTextContent('Ces dates chevauchent une réservation confirmée.');
  });

  it('montre un flux en échec et le synchronise à la demande', () => {
    monter();

    const flux = within(screen.getByTestId('calendar-feeds')).getAllByRole('listitem')[0];
    expect(flux).toHaveTextContent('en échec (3 tentatives)');
    expect(flux).not.toHaveTextContent('https://');
    fireEvent.click(within(flux).getByRole('button', { name: 'Synchroniser' }));

    expect(etat.syncFeed).toHaveBeenCalledWith({ id: 3 });
  });

  it('génère le lien d’export, le montre une fois et le copie', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    monter();
    const bloc = screen.getByTestId('calendar-export');

    fireEvent.click(within(bloc).getByRole('button', { name: 'Générer un nouveau lien' }));
    expect(await within(bloc).findByLabelText("Lien d'export iCal")).toHaveValue('https://api.takussan.com/ical/abc.ics');
    fireEvent.click(within(bloc).getByRole('button', { name: 'Copier' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://api.takussan.com/ical/abc.ics'));
    expect(await within(bloc).findByRole('button', { name: 'Copié' })).toBeInTheDocument();
  });
});

describe('PropertyDetailTabs — onglet calendrier (TCK-596 §3B)', () => {
  const bien = (rent_period: string | null, contract_type = 'rent') =>
    ({ id: 7, contract_type, rent_period, photos: [], price_history: [] }) as unknown as PropertyDetail;

  it('un séjour court a son calendrier', () => {
    render(withIntl(<PropertyDetailTabs property={bien('daily')} tags={[]} />));

    expect(screen.getByRole('tab', { name: 'Calendrier' })).toBeInTheDocument();
  });

  it('une location au mois ou une vente n’en a pas', () => {
    const { unmount } = render(withIntl(<PropertyDetailTabs property={bien('monthly')} tags={[]} />));
    expect(screen.queryByRole('tab', { name: 'Calendrier' })).not.toBeInTheDocument();
    unmount();

    render(withIntl(<PropertyDetailTabs property={bien(null, 'sale')} tags={[]} />));
    expect(screen.queryByRole('tab', { name: 'Calendrier' })).not.toBeInTheDocument();
  });
});
