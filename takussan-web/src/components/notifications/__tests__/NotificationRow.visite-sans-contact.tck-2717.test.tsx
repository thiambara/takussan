import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { AppNotification } from '@/lib/notifications';
import { withIntl, type LocaleDeTest } from '@/test/intl';

import { NotificationRow } from '../NotificationRow';

/**
 * TCK-2717 — le bailleur d'un bien d'agence qui n'est pas du personnel reçoit « visite demandée »
 * SANS le contact du visiteur quand la visite est rattachée à une fiche (`contact` nul, miroir de
 * `NotificationCode::unnamedParams()`). La cloche dit alors le créneau seul, comme le corps rendu
 * par l'API (`body_unnamed`) — jamais « Pour joindre le visiteur : — ».
 */
function notification(code: string, params: AppNotification['params'], param_types: AppNotification['param_types']): AppNotification {
  return {
    id: 9,
    type: 'visit',
    code,
    params,
    param_types,
    target: null,
    title: 'Titre écrit par l’API',
    body: 'Corps écrit par l’API',
    is_read: false,
    read_at: null,
    created_at: '2026-11-06T08:00:00+00:00',
  };
}

function renderRow(n: AppNotification, locale: LocaleDeTest) {
  render(withIntl(<ul><NotificationRow notification={n} onOpen={vi.fn()} onToggleRead={vi.fn()} /></ul>, locale));
}

const CRENEAU = { property: 'Villa Ngor', scheduled_at: '2026-11-20T10:00:00+00:00', timezone: 'Africa/Dakar' };
const TYPES_CRENEAU = { property: 'text', scheduled_at: 'datetime', timezone: 'text', contact: 'text' } as const;
const JOUR = { property: 'Villa Ngor', date: '2026-11-20', window: 'morning' };
const TYPES_JOUR = { property: 'text', date: 'date', window: 'visit_window', contact: 'text' } as const;

/** Le corps se reconnaît à son ouverture (« Créneau demandé », « Requested day »…), pas à l'année : l'horodatage la porte aussi. */
const corpsDeLaLigne = () => screen.getByText(/^(Créneau|Jour|Requested) /).textContent ?? '';

describe('NotificationRow — visite demandée sans contact (TCK-2717)', () => {
  it.each([
    ['fr', /^Créneau demandé : 20 novembre 2026.*10:00\.$/],
    ['en', /^Requested slot: 20 November 2026.*10:00\.$/],
    ['wo', /^Créneau demandé : .*2026.*10:00\.$/],
  ] as const)('créneau : le corps sans contact ne nomme aucun moyen de joindre (%s)', (locale, attendu) => {
    renderRow(notification('visit.requested', { ...CRENEAU, contact: null }, TYPES_CRENEAU), locale);

    const corps = corpsDeLaLigne();
    expect(corps).toMatch(attendu);
    expect(document.body.textContent ?? '').not.toContain('—');
  });

  it.each([
    ['fr', /^Jour demandé : 20 novembre 2026, le matin — heure à fixer\.$/],
    ['en', /^Requested day: 20 November 2026, in the morning — time to be set\.$/],
    ['wo', /^Jour demandé : .*2026, le matin — heure à fixer\.$/],
  ] as const)('jour et plage : le corps sans contact ne nomme aucun moyen de joindre (%s)', (locale, attendu) => {
    renderRow(notification('visit.requested_window', { ...JOUR, contact: null }, TYPES_JOUR), locale);

    const corps = corpsDeLaLigne();
    expect(corps).toMatch(attendu);
    expect(corps).not.toMatch(/joindre|reach|jokkoo/i);
  });

  it('un contact présent garde la phrase d’origine, contact compris', () => {
    renderRow(notification('visit.requested', { ...CRENEAU, contact: '+221 77 000 00 00' }, TYPES_CRENEAU), 'fr');
    expect(corpsDeLaLigne()).toMatch(/^Créneau demandé : .*\. Pour joindre le visiteur : \+221 77 000 00 00\.$/);
  });

  it('un contact présent garde la phrase d’origine (jour et plage)', () => {
    renderRow(notification('visit.requested_window', { ...JOUR, contact: 'awa@example.com' }, TYPES_JOUR), 'en');
    expect(corpsDeLaLigne()).toMatch(/To reach the visitor: awa@example\.com\.$/);
  });
});
