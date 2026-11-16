import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationPreferencesMatrix } from '../NotificationPreferencesMatrix';
import { ToastProvider } from '@/components/ui/toast';
import { EVENEMENTS_DE_PREFERENCE } from '@/lib/notification-preferences';
import { withIntl } from '@/test/intl';

/**
 * TCK-2864 (AC7, maquette `app-profil` a-2) — la rangée imposée « Vérification d’identité », cases
 * figées, « Toujours envoyée : sécurité du compte. » ; et l'écran ne montre que les événements que la
 * persona reçoit (le catalogue de TCK-2863).
 */
const getMock = vi.fn();
const updateMock = vi.fn();
vi.mock('@/app/actions/notification-preferences', () => ({
  getNotificationPreferencesAction: () => getMock(),
  updateNotificationPreferencesAction: (prefs: unknown) => updateMock(prefs),
}));

const CANAUX = ['inapp', 'email', 'push', 'sms', 'whatsapp'] as const;
/** Une ligne de la table `PreferenceCatalog::EVENT_PERSONAS` : réservés au locataire et au client. */
const DU_LOCATAIRE: Record<string, string[]> = {
  lease_payment_due: ['locataire'],
  invoice_reminder_sent: ['locataire'],
  saved_search_match: ['client', 'locataire'],
  favorite_price_drop: ['client', 'locataire'],
  favorite_unavailable: ['client', 'locataire'],
};

function reponse({ catalogue = true } = {}) {
  const preferences = EVENEMENTS_DE_PREFERENCE.flatMap((event) =>
    CANAUX.map((channel) =>
      channel === 'inapp'
        ? { event_type: event, channel, enabled: true, locked: true, reason: 'inapp_always_on' }
        : { event_type: event, channel, enabled: channel === 'email', locked: false },
    ),
  );
  const catalog = [
    ...EVENEMENTS_DE_PREFERENCE.map((e) => ({
      event_type: e,
      locked: false,
      channels: null,
      personas: DU_LOCATAIRE[e] ?? ['locataire', 'bailleur', 'agent', 'admin-agence', 'hote'],
    })),
    {
      event_type: 'identity_verification',
      locked: true,
      channels: ['inapp', 'email'],
      personas: ['bailleur', 'agent', 'admin-agence', 'hote', 'prestataire'],
      reason: 'always_sent',
    },
  ];
  return {
    preferences,
    events: [...EVENEMENTS_DE_PREFERENCE],
    channels: [...CANAUX],
    phone_verified: true,
    ...(catalogue ? { catalog } : {}),
  };
}

function monter(persona: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <NotificationPreferencesMatrix persona={persona} />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const matchMediaDOrigine = window.matchMedia;
function auBureau(oui: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: oui,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

beforeEach(() => {
  getMock.mockReset();
  updateMock.mockReset();
});
afterEach(() => {
  window.matchMedia = matchMediaDOrigine;
});

describe('<NotificationPreferencesMatrix> — téléphone (TCK-2864)', () => {
  beforeEach(() => auBureau(false));

  it('AC7 — « Vérification d’identité » est rendue en tête des alertes, ses puces figées, avec sa raison', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: reponse() });
    const { container } = monter('agent');
    await waitFor(() => expect(screen.getByText('Loyer en retard')).toBeInTheDocument());

    const rangee = container.querySelector('li[data-evenement="identity_verification"]') as HTMLElement;
    expect(rangee).not.toBeNull();
    expect(rangee.textContent).toContain('Vérification d’identité');
    expect(rangee.textContent).toContain('Toujours envoyée : sécurité du compte.');
    // En tête de son groupe : la première rangée des alertes.
    expect(rangee.parentElement?.querySelector('li[data-evenement]')).toBe(rangee);
    const puces = [...rangee.querySelectorAll('[role="checkbox"]')];
    expect(puces.map((p) => p.getAttribute('data-canal'))).toEqual(['inapp', 'email']);
    for (const p of puces) {
      expect(p).toBeDisabled();
      expect(p).toHaveAttribute('aria-checked', 'true');
    }
    await user.click(puces[1]!);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('AC7 — un agent ne voit pas les événements réservés au locataire', async () => {
    getMock.mockResolvedValue({ ok: true, data: reponse() });
    const { container } = monter('agent');
    await waitFor(() => expect(screen.getByText('Loyer en retard')).toBeInTheDocument());

    const rendus = [...container.querySelectorAll('li[data-evenement]')].map((li) => li.getAttribute('data-evenement'));
    for (const e of Object.keys(DU_LOCATAIRE)) expect(rendus).not.toContain(e);
    expect(rendus).toContain('message_received');
    expect(rendus).toHaveLength(EVENEMENTS_DE_PREFERENCE.length - Object.keys(DU_LOCATAIRE).length + 1);
  });

  it('un locataire ne voit pas la rangée imposée qu’il ne reçoit pas', async () => {
    getMock.mockResolvedValue({ ok: true, data: reponse() });
    const { container } = monter('locataire');
    await waitFor(() => expect(screen.getByText('Loyer en retard')).toBeInTheDocument());
    expect(container.querySelector('li[data-evenement="identity_verification"]')).toBeNull();
    expect(container.querySelector('li[data-evenement="lease_payment_due"]')).not.toBeNull();
  });

  it('sans catalogue (API d’avant), tous les événements restent, sans rangée imposée', async () => {
    getMock.mockResolvedValue({ ok: true, data: reponse({ catalogue: false }) });
    const { container } = monter('agent');
    await waitFor(() => expect(screen.getByText('Loyer en retard')).toBeInTheDocument());
    expect(container.querySelectorAll('li[data-evenement]')).toHaveLength(EVENEMENTS_DE_PREFERENCE.length);
  });
});

describe('<NotificationPreferencesMatrix> — bureau (TCK-2864)', () => {
  beforeEach(() => auBureau(true));

  it('AC7 — la rangée imposée a ses cases cochées et désactivées, et « — » ailleurs', async () => {
    getMock.mockResolvedValue({ ok: true, data: reponse() });
    monter('bailleur');
    await waitFor(() => expect(screen.getByText('Vérification d’identité')).toBeInTheDocument());

    for (const canal of ['Appli', 'E-mail']) {
      const c = screen.getByRole('checkbox', { name: new RegExp(`Vérification d’identité — ${canal}`) });
      expect(c).toHaveAttribute('aria-disabled', 'true');
      expect(c).toHaveAttribute('aria-checked', 'true');
    }
    expect(screen.queryByRole('checkbox', { name: /Vérification d’identité — SMS/ })).not.toBeInTheDocument();
    expect(screen.getByText('Toujours envoyée : sécurité du compte.')).toBeInTheDocument();
  });
});
