import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MaintenanceBanner } from '../MaintenanceBanner';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

function renderBanner(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: async () => payload,
  }));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MaintenanceBanner />
    </QueryClientProvider>,
  );
}

describe('<MaintenanceBanner>', () => {
  it('shows the public maintenance message', async () => {
    renderBanner({
      data: {
        active: false,
        show_banner: true,
        generated_at: '2026-05-07T10:00:00.000Z',
        window: {
          id: 1,
          starts_at: '2026-05-07T10:20:00.000Z',
          ends_at: '2026-05-07T11:00:00.000Z',
          mode: 'banner',
          severity: 'scheduled',
          messages: { fr: 'Maintenance planifiée' },
          banner_lead_minutes: 30,
        },
      },
    });

    expect(await screen.findByText(/Maintenance planifiée/i)).toBeInTheDocument();
  });
});
