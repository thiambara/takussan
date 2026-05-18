import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { patchNotificationTemplate, previewNotificationTemplate } from '@/lib/queries/super-admin';
import type { NotificationTemplateDetail } from '@/types/super-admin';
import { TemplateEditor } from '../notification-templates';

vi.mock('@/lib/queries/super-admin', () => ({
  patchNotificationTemplate: vi.fn(),
  previewNotificationTemplate: vi.fn(),
}));

const detail: NotificationTemplateDetail = {
  event: 'booking_confirmed',
  channel: 'email',
  name: 'Réservation confirmée',
  domain: 'Réservation',
  placeholders: ['booking.code', 'user.first_name'],
  sample_data: {},
  is_active: true,
  templates: {
    fr: { subject: 'Sujet', body: 'Bonjour {{ user.first_name }}' },
    en: { subject: 'Subject', body: 'Hello {{ user.first_name }}' },
    wo: { subject: 'Sujet', body: 'Bonjour {{ user.first_name }}' },
  },
};

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <NextIntlClientProvider locale="fr" messages={{ common: { actions: { close: 'Fermer' } } }}>
      <QueryClientProvider client={queryClient}>
        <TemplateEditor detail={detail} onChannelSelect={vi.fn()} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('<TemplateEditor>', () => {
  it('saves multilingual template edits and previews rendered content', async () => {
    vi.mocked(patchNotificationTemplate).mockResolvedValue({ data: detail });
    vi.mocked(previewNotificationTemplate).mockResolvedValue({
      data: {
        event: 'booking_confirmed',
        channel: 'email',
        locale: 'fr',
        subject: 'Sujet',
        body: 'Bonjour Awa',
      },
    });
    const user = userEvent.setup();
    renderEditor();

    await user.clear(screen.getByLabelText(/Corps/i));
    await user.type(screen.getByLabelText(/Corps/i), 'Bonjour {{ user.first_name }}!');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(patchNotificationTemplate).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /prévisualiser/i }));
    expect(await screen.findByText('Bonjour Awa')).toBeInTheDocument();
  });
});
