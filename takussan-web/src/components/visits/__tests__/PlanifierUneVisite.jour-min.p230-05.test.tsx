/**
 * P230.05 (TCK-2236) — « Planifier une visite » ne propose pas un jour passé
 * (`StorePropertyVisitRequest` : `scheduled_at` `after:now`, l'heure construite à Dakar). Navigateur
 * à New York, 01:00 Z le 25 octobre : le jour local est le 24, celui de Dakar le 25.
 */
process.env.TZ = 'America/New_York';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { PlanifierUneVisite } from '../PlanifierUneVisite';

vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    data: {
      data: [{ id: 'agent:9', type: 'agent', numeric_id: 9, agency_id: 3, status: 'active', created_at: null }],
      meta: { active_profile_id: 'agent:9', count: 1 },
    },
  }),
}));
vi.mock('@/lib/queries/visits', () => ({
  usePlanVisit: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreneauxDeVisite: () => ({ isPending: true, isSuccess: false, isError: false, data: undefined, refetch: vi.fn() }),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: () => ({ data: { data: [] } }) }));

describe('<PlanifierUneVisite> — jour minimal (P230.05)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('le champ du jour commence au jour de Dakar, et le borne à soixante jours (TCK-2586)', async () => {
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} agencyId={3} />));
    fireEvent.click(screen.getByRole('button', { name: 'Planifier une visite' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Autre date' }));

    expect(screen.getByLabelText('Date')).toHaveAttribute('min', '2026-10-25');
    expect(screen.getByLabelText('Date')).toHaveAttribute('max', '2026-12-24');
  });

  it('TCK-2586 — les pastilles de jour partent du jour de Dakar : « Aujourd’hui » est le 25, la troisième le mardi 27', async () => {
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} agencyId={3} />));
    fireEvent.click(screen.getByRole('button', { name: 'Planifier une visite' }));
    await screen.findByRole('dialog');

    expect(screen.getByRole('button', { name: 'Mar. 27' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lun. 26' })).not.toBeInTheDocument();
  });
});
