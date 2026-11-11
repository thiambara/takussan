import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { AppNotification } from '@/lib/notifications';
import { withIntl, type LocaleDeTest } from '@/test/intl';

import { NotificationRow } from '../NotificationRow';
import { varianteDe } from '../texteNotification';

/**
 * TCK-2706 AC5 — la cloche est rendue par le FRONT (`texteNotification.ts`), pas par le `body` de
 * l'API : une relance qui fusionne loyer et charges du même jour y dit aussi « loyer et charges »
 * et détaille les deux montants et le total ; des charges seules disent « charges », jamais
 * « loyer ». Un loyer seul garde son texte. Miroir de `NotificationCode::variant()`.
 */
const argent = (n: number) => ({ amount: `${n}.00`, currency: 'XOF' });
const TYPES = {
  amount: 'money', rent: 'money', charges: 'money', days: 'count', due_date: 'date', property: 'text', tenant: 'person', payment_url: 'url',
} as const;

function notification(code: string, params: AppNotification['params']): AppNotification {
  return {
    id: 11,
    type: 'payment',
    code,
    params,
    param_types: TYPES,
    target: null,
    title: 'Titre écrit par l’API',
    body: 'Corps écrit par l’API',
    is_read: false,
    read_at: null,
    created_at: '2026-11-06T08:00:00+00:00',
  };
}

function renderRow(n: AppNotification, locale: LocaleDeTest = 'fr') {
  render(withIntl(<ul><NotificationRow notification={n} onOpen={vi.fn()} onToggleRead={vi.fn()} /></ul>, locale));
}

const BASE = { due_date: '2026-11-05', property: 'Villa Ngor', days: 1 };
const FUSION = { ...BASE, amount: argent(650000), rent: argent(500000), charges: argent(150000) };
const CHARGES_SEULES = { ...BASE, amount: argent(150000), charges: argent(150000) };
const LOYER_SEUL = { ...BASE, amount: argent(500000) };

/** Le texte de la ligne entière : titre et corps. */
const texte = () => document.body.textContent ?? '';

describe('NotificationRow — relance fusionnée loyer et charges (TCK-2706)', () => {
  it.each([
    ['fr', 'Loyer et charges en retard', /^Votre loyer et vos charges pour Villa Ngor, dus le 5 novembre 2026, sont en retard de 1 jour : loyer 500.000.*, charges 150.000.*, total 650.000.*\.$/],
    ['en', 'Rent and charges overdue', /^Your rent and charges for Villa Ngor, due on 5 November 2026, are 1 day overdue: rent .*500.000.*, charges .*150.000.*, total .*650.000.*\.$/],
    ['wo', 'Loyer et charges en retard', /^Votre loyer et vos charges pour Villa Ngor, .* sont en retard de 1 jour : loyer .*500.000.*, charges .*150.000.*, total .*650.000.*\.$/],
  ] as const)('locataire en retard : nomme loyer ET charges, détaille les montants (%s)', (locale, titre, corps) => {
    renderRow(notification('lease_payment.overdue', FUSION), locale);

    expect(screen.getByText(titre)).toBeInTheDocument();
    expect(screen.getByText(corps)).toBeInTheDocument();
  });

  // `wo` porte le texte français, accordé par `=1` : les règles de pluriel du wolof ne rangent pas 1
  // sous `one`, et « 1 jours » s'afficherait.
  it.each([
    ['fr', 7, 'sont en retard de 7 jours : loyer'],
    ['wo', 7, 'sont en retard de 7 jours : loyer'],
    ['wo', 1, 'sont en retard de 1 jour : loyer'],
  ] as const)('accorde le pluriel des jours (%s, %i)', (locale, days, attendu) => {
    renderRow(notification('lease_payment.overdue', { ...FUSION, days }), locale);
    expect(texte()).toContain(attendu);
  });

  it('bailleur, charges seules, en wolof (texte français) : « 1 jour »', () => {
    renderRow(notification('lease_payment.overdue_landlord', { ...CHARGES_SEULES, tenant: 'Awa Diop' }), 'wo');
    expect(texte()).toContain('sont en retard de 1 jour.');
  });

  it('rappel J-3 fusionné', () => {
    renderRow(notification('lease_payment.due_soon', FUSION));
    expect(screen.getByText('Loyer et charges à payer le 5 novembre 2026')).toBeInTheDocument();
    expect(texte()).toMatch(/Votre loyer et vos charges pour Villa Ngor sont dus le 5 novembre 2026 : loyer .*, charges .*, total .*\./);
  });

  it('bailleur : loyer et charges impayés, au nom du locataire', () => {
    renderRow(notification('lease_payment.overdue_landlord', { ...FUSION, tenant: 'Awa Diop' }));
    expect(screen.getByText('Loyer et charges impayés : Villa Ngor')).toBeInTheDocument();
    expect(texte()).toMatch(/Le loyer et les charges de Awa Diop pour Villa Ngor sont en retard de 1 jour : loyer .*, charges .*, total .*\./);
  });

  it.each([
    ['lease_payment.due_soon', 'fr', 'Charges à payer le 5 novembre 2026', /loyer/i],
    ['lease_payment.overdue', 'fr', 'Charges en retard', /loyer/i],
    ['lease_payment.overdue', 'en', 'Charges overdue', /rent/i],
    ['lease_payment.overdue_landlord', 'fr', 'Charges impayées : Villa Ngor', /loyer/i],
  ] as const)('charges seules (%s, %s) : « charges », jamais « loyer »', (code, locale, titre, interdit) => {
    renderRow(notification(code, { ...CHARGES_SEULES, tenant: 'Awa Diop' }), locale);

    expect(screen.getByText(titre)).toBeInTheDocument();
    expect(texte()).toMatch(/charges/i);
    expect(texte()).not.toMatch(interdit);
  });

  it('un loyer seul garde son texte d’aujourd’hui', () => {
    renderRow(notification('lease_payment.overdue', LOYER_SEUL));
    expect(screen.getByText('Loyer en retard')).toBeInTheDocument();
    expect(texte()).toMatch(/Votre loyer de .*500.000.* pour Villa Ngor, dû le 5 novembre 2026, est en retard de 1 jour\./);
    expect(texte()).not.toMatch(/charges/i);
  });

  it('miroir de NotificationCode::variant() : codes, montants, absence', () => {
    expect(varianteDe('lease_payment.overdue', FUSION)).toBe('rent_charges');
    expect(varianteDe('lease_payment.due_soon', CHARGES_SEULES)).toBe('charges');
    expect(varianteDe('lease_payment.overdue', LOYER_SEUL)).toBeNull();
    expect(varianteDe('lease_payment.overdue', { ...LOYER_SEUL, charges: null })).toBeNull();
    // `charges` doit être un MONTANT, comme `is_array()` côté API.
    expect(varianteDe('lease_payment.overdue', { ...LOYER_SEUL, charges: '150000' })).toBeNull();
    // Hors des trois codes de relance, jamais de variante.
    expect(varianteDe('lease_payment.recorded', FUSION)).toBeNull();
  });
});
