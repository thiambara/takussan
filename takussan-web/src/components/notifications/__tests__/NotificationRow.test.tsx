import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AppNotification } from '@/lib/notifications';
import { withIntl, type LocaleDeTest } from '@/test/intl';

import { NotificationRow } from '../NotificationRow';

/**
 * TCK-588 — une notification est rendue par son CODE, dans la langue de l'écran, et la ligne
 * entière mène à sa cible.
 */

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 7,
    type: 'payment',
    code: 'lease_payment.overdue',
    params: {
      amount: { amount: '150000.00', currency: 'XOF' },
      days: 7,
      due_date: '2026-09-29',
      property: 'Villa Almadies',
    },
    target: { kind: 'lease', id: 12, path: '/app/leases/12' },
    title: 'Titre écrit par l’API',
    body: 'Corps écrit par l’API',
    is_read: false,
    read_at: null,
    created_at: '2026-10-06T08:00:00.000000Z',
    ...overrides,
  };
}

function renderRow(n: AppNotification, locale: LocaleDeTest = 'fr') {
  const onOpen = vi.fn();
  const onToggleRead = vi.fn();
  render(withIntl(<ul><NotificationRow notification={n} onOpen={onOpen} onToggleRead={onToggleRead} /></ul>, locale));
  return { onOpen, onToggleRead };
}

describe('NotificationRow', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['fr', 'Loyer en retard', /est en retard de 7 jours/],
    ['en', 'Rent overdue', /is 7 days overdue/],
    ['wo', 'Pey kër bi yàgg na', /yàgg na 7 fan/],
  ] as const)('rend le code dans la langue de l’écran (%s)', (locale, titre, corps) => {
    renderRow(notification(), locale);

    expect(screen.getByText(titre)).toBeInTheDocument();
    expect(screen.getByText(corps)).toBeInTheDocument();
    expect(screen.queryByText('Titre écrit par l’API')).not.toBeInTheDocument();
  });

  // TCK-597 (verif-597 m5) — un motif de modération arrive CODÉ : il se lit par son libellé
  // traduit, jamais « personal_data » en clair ; le complément libre le suit entre parenthèses.
  it.each([
    ['fr', {}, /Motif : Données personnelles\./],
    ['en', {}, /Reason: Personal data\./],
    ['fr', { reason: 'numéro visible' }, /Motif : Données personnelles \(numéro visible\)\./],
  ] as const)('traduit le motif de modération (%s)', (locale, extra, corps) => {
    renderRow(notification({
      type: 'system',
      code: 'moderation.property_hidden',
      params: { property: 'Villa Almadies', reason_code: 'personal_data', reason: null, ...extra },
      target: null,
    }), locale);

    const texte = screen.getByText(corps).textContent ?? '';
    expect(texte).not.toContain('personal_data');
  });

  it('formate le montant et la date, sans « 150000.00 » ni « XOF » bruts', () => {
    renderRow(notification());

    const corps = screen.getByText(/est en retard de 7 jours/).textContent ?? '';
    expect(corps).toMatch(/150\s000\sF\sCFA/u);
    expect(corps).toContain('29 sept. 2026');
    expect(corps).not.toContain('150000.00');
  });

  it('la ligne entière est un lien vers la cible, et l’ouvrir la signale', async () => {
    const { onOpen } = renderRow(notification());

    const lien = screen.getByRole('link');
    expect(lien).toHaveAttribute('href', '/app/leases/12');
    expect(lien).toHaveTextContent('Loyer en retard');

    await userEvent.click(lien);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it('sans cible, la notification n’est pas un lien', () => {
    renderRow(notification({ target: null }));

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Loyer en retard')).toBeInTheDocument();
  });

  it('un code inconnu du front affiche le titre de l’API, sans clé brute ni erreur', () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderRow(notification({ code: 'code.inconnu', params: {} }));

    expect(screen.getByText('Titre écrit par l’API')).toBeInTheDocument();
    expect(screen.getByText('Corps écrit par l’API')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('notifications.codes');
    expect(erreurs).not.toHaveBeenCalled();
  });

  it('une ligne sans code (historique) affiche son titre', () => {
    renderRow(notification({ code: null, params: null }));

    expect(screen.getByText('Titre écrit par l’API')).toBeInTheDocument();
  });
});
