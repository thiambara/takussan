import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { AppNotification } from '@/lib/notifications';
import { withIntl, type LocaleDeTest } from '@/test/intl';

import { NotificationRow } from '../NotificationRow';

/**
 * P235.03 (TCK-2369) — un paramètre de PERSONNE (`person`) vide — locataire ou bénéficiaire créés
 * par téléphone — se lit par un libellé traduit dans la cloche, comme dans le courriel
 * (`NotificationRenderer`), jamais « — » en tête de phrase.
 */
function notification(params: AppNotification['params'], overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 7,
    type: 'payment',
    code: 'lease_payment.received_landlord',
    params,
    param_types: { amount: 'money', property: 'text', tenant: 'person' },
    target: null,
    title: 'Titre écrit par l’API',
    body: 'Corps écrit par l’API',
    is_read: false,
    read_at: null,
    created_at: '2026-10-06T08:00:00+00:00',
    ...overrides,
  };
}

function renderRow(n: AppNotification, locale: LocaleDeTest = 'fr') {
  render(withIntl(<ul><NotificationRow notification={n} onOpen={vi.fn()} onToggleRead={vi.fn()} /></ul>, locale));
}

const LOYER = { amount: { amount: '150000.00', currency: 'XOF' }, property: 'Villa Almadies' };

describe('NotificationRow — personne sans nom (P235.03)', () => {
  it.each([
    ['fr', /^\(sans nom\) a payé .* pour Villa Almadies\.$/],
    ['en', /^\(unnamed\) paid .* for Villa Almadies\.$/],
  ] as const)('nomme un locataire vide par le libellé traduit (%s)', (locale, corps) => {
    renderRow(notification({ ...LOYER, tenant: '' }), locale);

    expect(screen.getByText(corps)).toBeInTheDocument();
  });

  it('nomme un bénéficiaire vide de même', () => {
    renderRow(notification(
      { role: 'agent', beneficiary: null },
      { type: 'team', code: 'role_delegation.expired_delegator', param_types: { role: 'role', beneficiary: 'person' } },
    ));

    expect(screen.getByText(/^La délégation à \(sans nom\) pour le rôle/)).toBeInTheDocument();
  });

  it('garde le nom quand il est là', () => {
    renderRow(notification({ ...LOYER, tenant: 'Awa Diop' }));

    expect(screen.getByText(/^Awa Diop a payé/)).toBeInTheDocument();
  });
});
