import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeatureFlagProvider, useFeatureFlag } from '../FeatureFlagProvider';

function Probe() {
  return <span>{useFeatureFlag('property_compare') ? 'enabled' : 'disabled'}</span>;
}

describe('<FeatureFlagProvider>', () => {
  it('loads client-visible flags for feature reads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ data: { property_compare: true } }),
    }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <FeatureFlagProvider>
          <Probe />
        </FeatureFlagProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('enabled')).toBeInTheDocument();
  });
});
