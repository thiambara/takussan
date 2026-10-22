import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { moderateReview, type ModerationReview } from '@/lib/queries/reviews-moderation';
import { withIntl } from '@/test/intl';
import { ModerationDetail } from '../ModerationDetail';

/**
 * TCK-1203 — trancher un avis exige la 2FA d'un profil plateforme (`ReviewController@moderate`,
 * `ProtectedActions::PLATFORM_TWO_FACTOR`) : le refus passe par la garde, puis la décision est
 * rejouée.
 */
vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchReviewReports: vi.fn(() => Promise.resolve({ data: [], meta: { total: 0 } })),
  moderateReview: vi.fn(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const refus = () => new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' });
const AVIS = {
  id: 1,
  rating: 4,
  title: 'Bel avis',
  content: 'Contenu de test',
  author: { id: 10, name: 'John Doe', avatar_url: null },
  reviewable_type: 'App\\Models\\Property',
  reviewable_id: 99,
  status: 'pending',
  is_approved: false,
  reported_count: 0,
  created_at: '2025-01-01T00:00:00Z',
  can_moderate: true,
} as unknown as ModerationReview;

function monter(garde: GardeDoubleFacteurFn) {
  const onModerated = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <ModerationDetail review={AVIS} onModerated={onModerated} platform />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
  return onModerated;
}

describe('<ModerationDetail> — second facteur', () => {
  beforeEach(() => {
    vi.mocked(moderateReview).mockReset();
  });

  it('un refus de second facteur ouvre la garde, puis la décision est rejouée', async () => {
    vi.mocked(moderateReview).mockRejectedValueOnce(refus()).mockResolvedValueOnce({} as never);
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const onModerated = monter(garde);

    await userEvent.click(screen.getByRole('button', { name: 'Approuver' }));

    await waitFor(() => expect(onModerated).toHaveBeenCalled());
    expect(garde).toHaveBeenCalledWith('two_factor_required');
    expect(moderateReview).toHaveBeenCalledTimes(2);
    expect(moderateReview).toHaveBeenLastCalledWith(1, { decision: 'approve' }, 'jeton');
  });

  it('garde abandonnée : pas de rejeu, l’erreur s’affiche', async () => {
    vi.mocked(moderateReview).mockRejectedValue(refus());
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => false);
    const onModerated = monter(garde);

    await userEvent.click(screen.getByRole('button', { name: 'Approuver' }));

    expect(await screen.findByText('Second facteur requis.')).toBeInTheDocument();
    expect(garde).toHaveBeenCalledTimes(1);
    expect(moderateReview).toHaveBeenCalledTimes(1);
    expect(onModerated).not.toHaveBeenCalled();
  });
});
