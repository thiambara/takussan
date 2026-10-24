/**
 * P230.05 (TCK-2236) — le `max` des dates d'une délégation part du jour de l'API, plus 366 jours
 * (`StoreRoleDelegationRequest` : `before_or_equal:` l'instant `now()->addDays(366)`; la date seule
 * vaut minuit UTC). Calculé par `setDate()` local puis relu par `toISOString()`, il passait d'un
 * jour cette borne à New York, à 23:00 Z le 8 mars 2026, quand l'heure d'été de 2027 n'a pas
 * encore commencé au 9 mars.
 */
process.env.TZ = 'America/New_York';

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CreateDelegationDialog } from '../CreateDelegationDialog';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton' }),
}));
vi.mock('@/lib/queries/role-delegations', () => ({
  useCreateRoleDelegation: () => ({ mutateAsync: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useDelegationCandidates: () => ({ data: { data: [] }, isLoading: false }),
}));

describe('CreateDelegationDialog — date maximale (P230.05)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-08T23:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('s’arrête au jour de l’API + 366, et non un jour plus loin', () => {
    render(withIntl(<CreateDelegationDialog agencyId={7} open onOpenChange={vi.fn()} />));

    expect(screen.getByLabelText('Fin')).toHaveAttribute('max', '2027-03-09');
    expect(screen.getByLabelText('Début (facultatif)')).toHaveAttribute('max', '2027-03-09');
  });
});
