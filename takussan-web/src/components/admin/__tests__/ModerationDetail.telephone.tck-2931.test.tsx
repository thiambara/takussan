import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { FournisseurDEnTete, useDeclarationDEnTete } from '@/components/layout/en-tete-de-la-coque';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import type { ModerationReview } from '@/lib/queries/reviews-moderation';
import { withIntl } from '@/test/intl';
import { ModerationDetail } from '../ModerationDetail';

/**
 * TCK-2931 — au téléphone, « Supprimer » et « Ignorer les signalements » vivent dans « ⋯ » de
 * l'en-tête (maquette `app-moderation` B, `:468`) : pour l'admin d'agence sur un avis publié qu'il
 * ne peut ni publier ni masquer, c'est le seul chemin vers ces gestes. La coque est doublée comme
 * `EnTeteMobile` la rend : les `actions` déclarées dans une feuille du bas ouverte par « ⋯ ».
 */
vi.mock('@/lib/queries/reviews-moderation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/reviews-moderation')>()),
  fetchReviewReports: vi.fn(() => Promise.resolve({ data: [], meta: { total: 0 } })),
  moderateReview: vi.fn(),
  fetchReviewSubjectSummary: vi.fn(() => Promise.reject(new Error('hors sujet'))),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const AVIS = {
  id: 31,
  rating: 1,
  title: null,
  content: 'Avis injurieux.',
  author: { id: 10, name: 'Awa Diop', avatar_url: null },
  reviewable_type: 'App\\Models\\Property',
  reviewable_id: 99,
  status: 'approved',
  is_approved: true,
  reported_count: 2,
  created_at: '2026-11-01T10:00:00Z',
  can_moderate: false,
  can_reply: false,
  can_delete: true,
  can_dismiss_reports: true,
} as unknown as ModerationReview;

function Coque() {
  const { actions } = useDeclarationDEnTete();
  return actions ? (
    <FeuilleDuBas titre="Plus d’actions" declencheur={<button type="button">⋯</button>}>
      {actions}
    </FeuilleDuBas>
  ) : null;
}

describe('ModerationDetail — téléphone (TCK-2931)', () => {
  it('« ⋯ » → « Supprimer » ouvre la confirmation (motif et quelques mots) ; les gestes ne sont pas dans le corps', async () => {
    const user = userEvent.setup();
    render(
      withIntl(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <FournisseurDEnTete>
            <Coque />
            <ModerationDetail review={AVIS} onModerated={vi.fn()} telephone />
          </FournisseurDEnTete>
        </QueryClientProvider>,
      ),
    );
    const detail = screen.getByTestId('moderation-detail');
    expect(within(detail).queryByRole('button', { name: /supprimer/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: '⋯' }));
    expect(await screen.findByRole('button', { name: /ignorer les signalements/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /supprimer/i }));

    const confirmation = await screen.findByTestId('moderation-confirm');
    expect(confirmation).toHaveTextContent('Confirmer la suppression de cet avis');
    expect(within(confirmation).getByLabelText(/quelques mots \(obligatoires/i)).toBeInTheDocument();
    expect(confirmation).toHaveFocus();
  });
});
