import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { Calendar } from '@/components/ui/calendar';
import { PropertyPriceHistoryList } from '@/components/property-dashboard/PropertyPriceHistoryList';
import { formatCurrency, toIntlLocale } from '@/lib/format';
import { formatMontant, formatPriceShort } from '@/lib/format/currency';
import { formatPrice } from '@/lib/utils';
import { withIntl, type LocaleDeTest } from '@/test/intl';

/**
 * TCK-347 — le formatage des nombres et des dates suit la locale ACTIVE.
 *
 * ⚠ AC2 est écrit pour qu'un helper qui IGNORE son argument ne le coche pas : le MÊME composant
 * est monté sous `fr`, `en` et `wo`, et l'on assère des chaînes DIFFÉRENTES entre `fr` et `en`.
 * `wo` doit rendre exactement `fr` : ni CLDR ni date-fns ne connaissent le wolof, et le repli est
 * explicite (`ETIQUETTES_INTL`, `DATE_FNS_LOCALES`) — `Intl` à qui l'on passerait `'wo'` brut
 * retomberait sur la locale racine, c'est-à-dire un format de type anglais.
 */

const normalise = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ');

const ENTREE = {
  id: 1,
  old_price: 1_250_000,
  new_price: 1_300_000,
  currency: 'XOF',
  reason: null,
  changed_at: '2026-02-03T10:00:00Z',
} as const;

function historique(locale: LocaleDeTest): string {
  const { container, unmount } = render(
    withIntl(<PropertyPriceHistoryList entries={[ENTREE]} unknownDateLabel="?" />, locale),
  );
  const texte = normalise(container.textContent);
  unmount();
  return texte;
}

function legendeDuCalendrier(locale: LocaleDeTest): string {
  const { container, unmount } = render(
    withIntl(<Calendar mode="single" month={new Date(2026, 8, 1)} />, locale),
  );
  const texte = normalise(container.querySelector('.rdp-caption_label')?.textContent);
  const jours = normalise(container.querySelector('.rdp-weekdays')?.textContent);
  unmount();
  return `${texte} | ${jours}`;
}

describe('AC2 — le même composant sous fr, en et wo', () => {
  it('l’historique des prix : montant ET date dans la langue de l’écran', () => {
    const fr = historique('fr');
    const en = historique('en');
    const wo = historique('wo');

    expect(fr).toContain('1 250 000 F CFA');
    expect(fr).toContain('1 300 000 F CFA');
    expect(en).toContain('1,250,000 F CFA');
    expect(en).toContain('1,300,000 F CFA');
    expect(en).not.toContain('1 250 000');
    expect(fr).not.toBe(en);
    expect(wo).toBe(fr);
  });

  it('le calendrier : noms de mois et de jours dans la langue de l’écran', () => {
    const fr = legendeDuCalendrier('fr');
    const en = legendeDuCalendrier('en');
    const wo = legendeDuCalendrier('wo');

    expect(fr).toMatch(/septembre 2026/i);
    expect(en).toMatch(/September 2026/);
    expect(fr).not.toBe(en);
    expect(wo).toBe(fr);
  });
});

describe('AC3 — le rendu français est inchangé, caractère pour caractère', () => {
  // Avant TCK-347 : `formatPrice(x, devise)` = `formatMontant(x, devise, { locale: 'fr-SN' })`.
  it.each([
    [1_250_000, 'XOF'],
    [1_250_000, 'XAF'],
    [1_250.5, 'EUR'],
    [1_250.5, 'USD'],
    [0, 'XOF'],
  ])('formatPrice(%s, %s, fr) rend ce que la carte rendait', (montant, devise) => {
    expect(formatPrice(montant, devise, 'fr')).toBe(formatMontant(montant, devise, { locale: 'fr-SN' }));
  });

  it('XOF reste sans décimales dans toutes les langues (contrainte 1)', () => {
    for (const locale of ['fr', 'en', 'wo'] as const) {
      expect(formatPrice(1_250_000.4, 'XOF', locale)).not.toMatch(/[.,]\d{1,2}\s*F CFA$/);
    }
  });

  // Avant TCK-347 : `PropertyReservationDialog` et `PropertyPriceHistory` appelaient
  // `formatMontant(x, devise)` SANS locale, donc celle de la DEVISE. Dérogation nommée : USD.
  it.each([
    [1_250_000, 'XOF'],
    [1_250_000, 'XAF'],
    [1_250.5, 'EUR'],
  ])('réservation / historique public : %s %s inchangé en fr', (montant, devise) => {
    expect(formatCurrency(montant, 'fr', { currency: devise })).toBe(formatMontant(montant, devise));
  });

  it('réservation / historique public : USD est la seule dérogation (en-US → fr-SN)', () => {
    expect(formatMontant(1_250.5, 'USD')).toBe('$1,250.50');
    expect(normalise(formatCurrency(1_250.5, 'fr', { currency: 'USD' }))).toBe('$1 250,50');
  });

  it('le marqueur de carte : abrégé inchangé en fr, anglais en en, wo comme fr', () => {
    expect(formatPriceShort(1_200_000, toIntlLocale('fr'))).toBe(formatPriceShort(1_200_000, 'fr-SN'));
    expect(normalise(formatPriceShort(1_200_000, toIntlLocale('fr')))).toBe('1,2 M');
    expect(normalise(formatPriceShort(1_200_000, toIntlLocale('en')))).toBe('1.2 M');
    expect(formatPriceShort(1_500_000_000, toIntlLocale('wo'))).toBe(formatPriceShort(1_500_000_000, toIntlLocale('fr')));
  });

  it('wo formate comme fr, en formate autrement', () => {
    expect(formatPrice(1_250_000, 'XOF', 'wo')).toBe(formatPrice(1_250_000, 'XOF', 'fr'));
    expect(normalise(formatPrice(1_250_000, 'XOF', 'en'))).toBe('1,250,000 F CFA');
  });
});
