import { describe, expect, it } from 'vitest';

import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { formatMontant, formatPriceShort } from '@/lib/format/currency';
import { equivalentXofIa, formaterMontantIa } from '@/lib/format/montant-ia';
import { ecrireMontant, lireSaisie } from '@/lib/format/saisie-montant';
import { formatteursPour } from '@/lib/format/useFormatteurs';

/**
 * TCK-2714 (décision n° 11 (a) du porteur, 2026-11-11) — les groupes de milliers s'affichent par une
 * espace INSÉCABLE de pleine largeur (U+00A0), et non plus par l'espace fine (U+202F) d'`Intl` en
 * `fr-SN` : DM Sans dessine la fine à 0,133 em, et au téléphone « 1 482 166 » se lisait « 1482166 ».
 *
 * Les attentes sont écrites en ÉCHAPPEMENTS : les trois espaces ont la même allure dans un éditeur.
 */
const INSEC = '\u00a0';
const FINE = '\u202f';
const ESPACE = '\u0020';

/** Les points de code d'un texte qui ne sont ni des chiffres ni des lettres : ce que l'œil ne distingue pas. */
const espaces = (s: string) => [...s].filter((c) => /\s/u.test(c)).map((c) => c.codePointAt(0)!.toString(16));

describe('TCK-2714 — AC1 : montantCourt groupe par U+00A0 en fr et en wo', () => {
  it('« 1 482 166 F » en fr et en wo, aucune espace fine', () => {
    for (const locale of ['fr', 'wo'] as const) {
      const sortie = formatteursPour(locale).montantCourt(1_482_166);
      expect(sortie).toBe(`1${INSEC}482${INSEC}166${INSEC}F`);
      expect(sortie).not.toContain(FINE);
    }
  });

  it('« 1,482,166 F » en anglais : la virgule ne change pas', () => {
    expect(formatteursPour('en').montantCourt(1_482_166)).toBe(`1,482,166${INSEC}F`);
  });
});

describe('TCK-2714 — un seul point de passage : tout formatage de montant ou de nombre', () => {
  it('formatNumber (fr, wo) groupe par U+00A0 ; en-GB garde la virgule', () => {
    expect(formatNumber(1_234_567.5, 'fr')).toBe(`1${INSEC}234${INSEC}567,5`);
    expect(formatNumber(1_234_567, 'wo')).toBe(`1${INSEC}234${INSEC}567`);
    expect(formatNumber(1_234_567, 'en')).toBe('1,234,567');
  });

  it('formatMontant : XOF (fr-SN), XAF (fr-CM), EUR (fr-FR) ; USD (en-US) inchangé', () => {
    // Le groupe, l'espace avant le symbole, puis celle de « F CFA ».
    expect(espaces(formatMontant(150_000))).toEqual(['a0', 'a0', '20']);
    expect(formatMontant(150_000).startsWith(`150${INSEC}000`)).toBe(true);
    expect(formatMontant(1_500_000, 'XAF').startsWith(`1${INSEC}500${INSEC}000`)).toBe(true);
    expect(formatMontant(150_000.5, 'EUR').startsWith(`150${INSEC}000,50`)).toBe(true);
    expect(formatMontant(150_000, 'USD')).toBe('$150,000.00');
  });

  it('formatCurrency, montant(), nombre() et montantAbrege() suivent', () => {
    const fr = formatteursPour('fr');
    expect(formatCurrency(2_500_000, 'fr')).not.toContain(FINE);
    expect(fr.montant(2_500_000)).not.toContain(FINE);
    expect(fr.nombre(2_500_000)).toBe(`2${INSEC}500${INSEC}000`);
    expect(fr.montantAbrege(850)).toBe(`850${INSEC}F`);
    expect(fr.montantAbrege(3_900_000)).not.toContain(FINE);
  });

  it('formatPriceShort et les montants de l’IA (entrée en chaîne) aussi', () => {
    expect(formatPriceShort(1_500_000_000_000)).not.toContain(FINE);
    expect(formaterMontantIa('1234567.5', 'XOF').startsWith(`1${INSEC}234${INSEC}568`)).toBe(true);
    expect(equivalentXofIa('2000', '600.5')).not.toContain(FINE);
  });

  it('jamais l’espace ordinaire U+0020 entre deux chiffres : un montant ne se coupe pas (AC6)', () => {
    for (const sortie of [
      formatNumber(9_876_543_210, 'fr'),
      formatMontant(9_876_543_210),
      formatteursPour('fr').montantCourt(9_876_543_210),
      formaterMontantIa('9876543210', 'XOF'),
    ]) {
      expect(sortie).not.toMatch(/\d[\u0020\u202f]\d/u);
    }
  });
});

describe('TCK-2714 — AC7 : rien d’autre ne bouge', () => {
  it('« 87 % » garde son espace avant le signe (U+00A0, celle d’ICU), et « 1 250 % » ne change que ses groupes', () => {
    expect(formatteursPour('fr').pourcentage(0.87)).toBe(`87${INSEC}%`);
    expect(formatPercent(0.87, 'fr')).toBe(`87${INSEC}%`);
    expect(formatPercent(12.5, 'fr')).toBe(`1${INSEC}250${INSEC}%`);
  });

  it('l’espace avant le symbole garde son caractère (U+00A0), et celle de « F CFA » le sien (U+0020)', () => {
    expect(formatMontant(150_000)).toBe(`150${INSEC}000${INSEC}F${ESPACE}CFA`);
    expect(formatteursPour('fr').montantCourt(150_000)).toBe(`150${INSEC}000${INSEC}F`);
  });
});

describe('TCK-2714 — AC3 à AC5 : la saisie lit les trois espaces et écrit U+00A0', () => {
  const trois = [
    ['U+202F', FINE],
    ['U+00A0', INSEC],
    ['U+0020', ESPACE],
  ] as const;

  it.each(trois)('« 1 482 166 » séparé par %s vaut 1482166 en XOF, et s’affiche en U+00A0', (_, sep) => {
    expect(lireSaisie(`1${sep}482${sep}166`, 0, 'fr')).toEqual({
      affichage: `1${INSEC}482${INSEC}166`,
      valeur: 1_482_166,
    });
  });

  it.each(trois)('« 1 482 166 » séparé par %s vaut 1482166 en EUR, et s’affiche en U+00A0', (_, sep) => {
    expect(lireSaisie(`1${sep}482${sep}166`, 2, 'fr')).toEqual({
      affichage: `1${INSEC}482${INSEC}166`,
      valeur: 1_482_166,
    });
  });

  it('AC4 — en EUR, « 1 500 » (U+202F) vaut 1500, jamais 1,50 ; « 1 500,5 » (U+00A0) vaut 1500,5', () => {
    expect(lireSaisie(`1${FINE}500`, 2, 'fr').valeur).toBe(1500);
    expect(lireSaisie(`1${INSEC}500,5`, 2, 'fr')).toEqual({ affichage: `1${INSEC}500,5`, valeur: 1500.5 });
    expect(lireSaisie(`1${ESPACE}500,50`, 2, 'fr').valeur).toBe(1500.5);
  });

  it.each(trois)('AC4 — en EUR, une espace %s ne marque jamais les décimales : « 12 50 » vaut 1250, pas 12,50', (_, sep) => {
    // Le seul texte où une espace prise pour une marque changerait la valeur : deux chiffres derrière
    // elle (trois feraient un groupe, et une virgule tranche d'elle-même).
    expect(lireSaisie(`12${sep}50`, 2, 'fr')).toEqual({ affichage: `1${INSEC}250`, valeur: 1250 });
  });

  it('AC5 — la valeur remise est un nombre, sans aucune espace ; l’affichage repris est en U+00A0', () => {
    const { valeur } = lireSaisie(`49${FINE}000${INSEC}000${ESPACE}F CFA`, 0, 'fr');
    expect(valeur).toBe(49_000_000);
    expect(typeof valeur).toBe('number');
    expect(ecrireMontant(1_482_166, 0, 'fr')).toBe(`1${INSEC}482${INSEC}166`);
    expect(ecrireMontant('1500.5', 2, 'fr')).toBe(`1${INSEC}500,5`);
  });
});
