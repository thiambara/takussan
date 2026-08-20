import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { postBusinessEnumValue } from '@/lib/queries/super-admin';
import { EnumValueDialog } from '../business-enums';
import { withIntl } from '@/test/intl';

vi.mock('@/lib/queries/super-admin', () => ({
  postBusinessEnumValue: vi.fn(),
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <EnumValueDialog enumKey="property_type" value={null} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  ));
}

describe('<EnumValueDialog>', () => {
  it('posts a new multilingual enum value', async () => {
    vi.mocked(postBusinessEnumValue).mockResolvedValue({
      data: {
        key: 'property_type',
        name: 'Types de biens',
        description: '',
        values: [],
      },
    });
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Valeur'), 'lodge');
    await user.type(screen.getByLabelText('FR'), 'Lodge');
    await user.type(screen.getByLabelText('EN'), 'Lodge');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(postBusinessEnumValue).toHaveBeenCalledWith('property_type', {
      value: 'lodge',
      labels: { fr: 'Lodge', en: 'Lodge', wo: '' },
      is_active: true,
    }));
  });
});
