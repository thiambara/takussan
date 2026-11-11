import { describe, expect, it } from 'vitest';

import { DATE_COURTE, formatteursPour, VALEUR_ABSENTE } from '../useFormatteurs';

/**
 * TCK-2685 (A § 6, AC6) — les préréglages de format de la partie connectée.
 *
 * Les attentes sont écrites en ÉCHAPPEMENTS, jamais en caractères : une espace fine insécable
 * (U+202F), une insécable (U+00A0) et une espace ordinaire ont la même allure dans un éditeur, et
 * c'est exactement l'écart que la maquette commettait (274 montants en dur, sécables).
 */
const fr = formatteursPour('fr');
const en = formatteursPour('en');
const FINE = ' ';
const INSEC = ' ';

/** Une horloge figée en 2026, au fuseau de Dakar (UTC+0 toute l'année). */
const EN_2026 = new Date('2026-11-11T12:00:00Z');

describe('TCK-2685 — montant court et abrégé', () => {
  it('« 1 355 000 F » : groupes U+202F, symbole collé par U+00A0', () => {
    expect(fr.montantCourt(1_355_000)).toBe(`1${FINE}355${FINE}000${INSEC}F`);
  });

  it('le franc CFA d’Afrique centrale aussi ; une autre devise garde son symbole', () => {
    expect(fr.montantCourt(1_000, 'XAF')).toBe(`1${FINE}000${INSEC}F`);
    expect(fr.montantCourt(12.5, 'EUR')).toBe(`12,50${INSEC}€`);
    expect(en.montantCourt(12.5, 'USD')).toBe('$12.50');
  });

  it('« 3,9 M F », « 350 k F », « 850 F »', () => {
    expect(fr.montantAbrege(3_900_000)).toBe(`3,9${INSEC}M${INSEC}F`);
    expect(fr.montantAbrege(350_000)).toBe(`350${INSEC}k${INSEC}F`);
    expect(fr.montantAbrege(850)).toBe(`850${INSEC}F`);
  });

  it('une valeur absente rend le tiret de la console', () => {
    expect(fr.montantCourt(null)).toBe(VALEUR_ABSENTE);
    expect(fr.montantAbrege(undefined)).toBe(VALEUR_ABSENTE);
  });

  it('`montant()` sans préréglage rend toujours « 1 355 000 F CFA »', () => {
    expect(fr.montant(1_355_000)).toBe(`1${FINE}355${FINE}000${INSEC}F CFA`);
  });
});

describe('TCK-2685 — jour et mois', () => {
  it('« 4 nov. » pour une date de l’année en cours', () => {
    expect(fr.jourMois('2026-11-04T10:00:00Z', EN_2026)).toBe('4 nov.');
  });

  it('« 4 déc. 2025 » pour une date d’une autre année', () => {
    expect(fr.jourMois('2025-12-04T10:00:00Z', EN_2026)).toBe('4 déc. 2025');
    expect(fr.jourMois('2027-01-04T10:00:00Z', EN_2026)).toBe('4 janv. 2027');
  });

  it('l’année se juge au fuseau de Dakar : le 31 décembre à 23 h 30 reste dans son année', () => {
    expect(fr.jourMois('2025-12-31T23:30:00Z', new Date('2026-01-01T00:10:00Z'))).toBe('31 déc. 2025');
  });

  it('sans horloge passée, l’année en cours est celle de l’horloge', () => {
    const maintenant = new Date();
    expect(fr.jourMois(maintenant)).not.toMatch(/\d{4}/);
  });

  it('`date()` et `DATE_COURTE` gardent leur sortie', () => {
    expect(fr.date('2026-11-04T10:00:00Z')).toBe('4 nov. 2026');
    expect(fr.date('2026-11-04T10:00:00Z', DATE_COURTE)).toBe('04 nov. 2026');
  });

  it('une date absente ou invalide rend le tiret', () => {
    expect(fr.jourMois(null, EN_2026)).toBe(VALEUR_ABSENTE);
    expect(fr.jourMois('pas une date', EN_2026)).toBe(VALEUR_ABSENTE);
  });
});

describe('TCK-2685 — heure et pourcentage', () => {
  it('« 09:00 », jamais « 9 h 00 »', () => {
    expect(fr.heure('2026-11-04T09:00:00Z')).toBe('09:00');
    expect(fr.heure('2026-11-04T21:05:00Z')).toBe('21:05');
    expect(en.heure('2026-11-04T09:00:00Z')).toBe('09:00');
  });

  it('« 87 % » à espace insécable, d’une fraction', () => {
    expect(fr.pourcentage(0.87)).toBe(`87${INSEC}%`);
    expect(fr.pourcentage(0.875)).toBe(`88${INSEC}%`);
    expect(fr.pourcentage(null)).toBe(VALEUR_ABSENTE);
  });
});
