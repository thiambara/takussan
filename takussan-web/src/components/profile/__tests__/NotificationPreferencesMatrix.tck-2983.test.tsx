import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationPreferencesMatrix } from '../NotificationPreferencesMatrix';
import { ToastProvider } from '@/components/ui/toast';
import { EVENEMENTS_DE_PREFERENCE } from '@/lib/notification-preferences';
import { withIntl } from '@/test/intl';

/**
 * TCK-2983 (TCK-2985, ADR-0132 § 6) — le résumé du lundi du bailleur : une rangée dans « Biens », avec
 * les seules cases que l'API ouvre (`email`, `whatsapp`, éteintes par défaut, pas d'`inapp`), et la case
 * envoie le bon `PATCH`.
 */
const getMock = vi.fn();
const updateMock = vi.fn();
vi.mock('@/app/actions/notification-preferences', () => ({
  getNotificationPreferencesAction: () => getMock(),
  updateNotificationPreferencesAction: (prefs: unknown) => updateMock(prefs),
}));

const CANAUX = ['inapp', 'email', 'push', 'sms', 'whatsapp'] as const;
const RESUME = 'owner_weekly_digest';

function reponse(resumeEmail = false) {
  type Case = { event_type: string; channel: string; enabled: boolean; locked: boolean; reason?: string };
  const preferences = EVENEMENTS_DE_PREFERENCE.flatMap((event): Case[] =>
    event === RESUME
      ? [
          { event_type: event, channel: 'email', enabled: resumeEmail, locked: false },
          { event_type: event, channel: 'whatsapp', enabled: false, locked: false },
        ]
      : CANAUX.map((channel) =>
          channel === 'inapp'
            ? { event_type: event, channel, enabled: true, locked: true, reason: 'inapp_always_on' }
            : { event_type: event, channel, enabled: channel === 'email', locked: false },
        ),
  );
  return { preferences, events: [...EVENEMENTS_DE_PREFERENCE], channels: [...CANAUX], phone_verified: true };
}

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <NotificationPreferencesMatrix persona="bailleur" />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const matchMediaDOrigine = window.matchMedia;
function auBureau(oui: boolean) {
  window.matchMedia = (query: string) =>
    ({ matches: oui, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

beforeEach(() => {
  getMock.mockReset();
  updateMock.mockReset();
});
afterEach(() => {
  window.matchMedia = matchMediaDOrigine;
});

describe('le résumé du lundi dans les préférences (TCK-2983)', () => {
  it('téléphone : une rangée « Biens » avec e-mail et WhatsApp seulement ; l’e-mail allumé envoie son PATCH', async () => {
    auBureau(false);
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: reponse() });
    updateMock.mockResolvedValue({ ok: true, data: reponse(true) });
    const { container } = monter();
    await waitFor(() => expect(screen.getByText('Résumé du lundi de mes biens')).toBeInTheDocument());

    const rangee = container.querySelector(`li[data-evenement="${RESUME}"]`) as HTMLElement;
    const puces = [...rangee.querySelectorAll('[role="checkbox"]')];
    expect(puces.map((p) => p.getAttribute('data-canal'))).toEqual(['email', 'whatsapp']);
    expect(puces.every((p) => p.getAttribute('aria-checked') === 'false')).toBe(true);

    await user.click(puces[0]!);
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith([{ event_type: RESUME, channel: 'email', enabled: true }]));
  });

  it('bureau : les deux cases, et « — » pour les canaux que l’API n’ouvre pas', async () => {
    auBureau(true);
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: reponse(true) });
    updateMock.mockResolvedValue({ ok: true, data: reponse(false) });
    monter();
    await waitFor(() => expect(screen.getByText('Résumé du lundi de mes biens')).toBeInTheDocument());

    expect(screen.queryByRole('checkbox', { name: /Résumé du lundi de mes biens — (Appli|SMS)/ })).not.toBeInTheDocument();
    const email = screen.getByRole('checkbox', { name: /Résumé du lundi de mes biens — E-mail/ });
    expect(email).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: /Résumé du lundi de mes biens — WhatsApp/ })).toHaveAttribute('aria-checked', 'false');
    await user.click(email);
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith([{ event_type: RESUME, channel: 'email', enabled: false }]));
  });
});
