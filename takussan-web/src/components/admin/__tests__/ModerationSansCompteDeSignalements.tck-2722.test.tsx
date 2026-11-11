import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { fetchReviewReports, type ModerationReview } from '@/lib/queries/reviews-moderation';
import { withIntl } from '@/test/intl';
import { ModerationDetail } from '../ModerationDetail';
import { ModerationQueueList } from '../ModerationQueueList';

/**
 * TCK-2722 — l'API retire `reported_count` d'une ligne que le lecteur ne modère pas (un avis sur
 * l'agence elle-même, dans la file d'agence). La ligne et le détail ne disent alors rien des
 * signalements : ni drapeau, ni « 0 », ni « undefined », ni lecture des signalements, ni « Ignorer
 * les signalements ». Chaque cas a son témoin AVEC un compte, pour que l'absence prouve quelque chose.
 */
vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchReviewReports: vi.fn(() => Promise.resolve({ data: [], meta: { total: 0 } })),
  moderateReview: vi.fn(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

function avis(id: number, extra: Record<string, unknown> = {}): ModerationReview {
  return {
    id,
    rating: 4,
    title: `Avis ${id}`,
    content: 'Équipe sérieuse.',
    author: { id: 10 + id, name: 'Awa Diop', avatar_url: null },
    reviewable_type: 'App\\Models\\Agency',
    reviewable_id: 3,
    status: 'reported',
    is_approved: false,
    created_at: '2026-11-01T10:00:00Z',
    can_moderate: true,
    ...extra,
  } as unknown as ModerationReview;
}

describe('TCK-2722 — une ligne de modération sans reported_count', () => {
  it('ModerationQueueList : aucun drapeau ni compte sur la ligne sans clé, le témoin garde le sien', () => {
    render(withIntl(
      <ModerationQueueList reviews={[avis(1), avis(2, { reported_count: 3 })]} selectedId={null} onSelect={vi.fn()} />,
    ));

    const sansCle = screen.getByTestId('moderation-queue-item-1');
    expect(sansCle.querySelector('svg.lucide-flag')).toBeNull();
    expect(sansCle).not.toHaveTextContent(/undefined|NaN/);
    expect(within(sansCle).queryByText('0')).toBeNull();
    expect(sansCle).toHaveTextContent('4/5');

    const temoin = screen.getByTestId('moderation-queue-item-2');
    expect(temoin.querySelector('svg.lucide-flag')).not.toBeNull();
    expect(within(temoin).getByText('3')).toBeInTheDocument();
  });

  it('ModerationDetail : sans clé, ni lecture des signalements ni « Ignorer les signalements » ; avec un compte, les deux', async () => {
    const lire = vi.mocked(fetchReviewReports);
    lire.mockClear();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { unmount } = render(withIntl(
      <QueryClientProvider client={client}>
        <ModerationDetail review={avis(1)} onModerated={vi.fn()} platform />
      </QueryClientProvider>,
    ));
    expect(await screen.findByText('Équipe sérieuse.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ignorer les signalements/ })).toBeNull();
    expect(document.body).not.toHaveTextContent(/undefined|NaN|Signalements \(0\)/);
    expect(lire).not.toHaveBeenCalled();
    unmount();

    render(withIntl(
      <QueryClientProvider client={client}>
        <ModerationDetail review={avis(2, { reported_count: 2 })} onModerated={vi.fn()} platform />
      </QueryClientProvider>,
    ));
    expect(await screen.findByRole('button', { name: /Ignorer les signalements/ })).toBeInTheDocument();
    expect(lire).toHaveBeenCalledWith(2, 'jeton');
  });
});
