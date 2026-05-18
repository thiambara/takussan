import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { postModerationDecision } from '@/lib/queries/super-admin';
import type { AdminModerationItem } from '@/types/super-admin';
import { ModerationDecisionPanel } from '../moderation';

vi.mock('@/lib/queries/super-admin', () => ({
  postModerationDecision: vi.fn(),
}));

const item: AdminModerationItem = {
  id: 'review:12',
  type: 'review',
  status: 'flagged',
  subject_type: 'review',
  subject_id: 12,
  subject: {
    id: 12,
    title: 'Avis injurieux',
    subtitle: 'Villa Almadies',
    href: '/super-admin/moderation?filter%5Btype%5D=review',
  },
  reporter: { id: 4, name: 'Awa Ndiaye', email: 'awa@example.test' },
  agency: { id: 2, name: 'Dakar Immo', slug: 'dakar-immo' },
  reason: 'Spam',
  reported_count: 2,
  reported_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};

function renderPanel(onDone = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ModerationDecisionPanel item={item} onDone={onDone} />
    </QueryClientProvider>,
  );

  return { onDone };
}

describe('<ModerationDecisionPanel>', () => {
  it('requires a reason and posts the selected decision', async () => {
    vi.mocked(postModerationDecision).mockResolvedValue({
      data: { id: 'review:12', decision: 'hide', subject_type: 'review', subject_id: 12 },
    });
    const { onDone } = renderPanel();
    const user = userEvent.setup();

    const hide = screen.getByRole('button', { name: /masquer/i });
    expect(hide).toBeDisabled();

    await user.type(screen.getByLabelText(/raison de décision/i), 'Contenu contraire aux règles.');
    await user.click(hide);

    await waitFor(() => expect(postModerationDecision).toHaveBeenCalledWith('review:12', {
      decision: 'hide',
      reason: 'Contenu contraire aux règles.',
    }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
