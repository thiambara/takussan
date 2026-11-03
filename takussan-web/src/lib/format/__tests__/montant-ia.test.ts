import { describe, expect, it } from 'vitest';
import {
  comparerMontantsIa,
  equivalentXofIa,
  formaterMontantIa,
  formaterTarifIa,
  lireSaisieMontantIa,
  multiplierMontantsIa,
} from '../montant-ia';

describe('l’argent du socle IA à l’écran (TCK-2448, ADR-0086)', () => {
  it('AC10 — un coût minuscule ne se lit pas 0, ni en dollars ni en XOF', () => {
    expect(formaterMontantIa('0.00000000004')).toBe('$0.00000000004');
    expect(formaterMontantIa('0.00000000000000028')).toBe('$0.00000000000000028');
    expect(equivalentXofIa('0.00000000004', '600')).toMatch(/^0,000000024\s*F\sCFA$/);
  });

  it('garde les décimales de la devise au-dessus du seuil, et 3 chiffres significatifs en dessous', () => {
    expect(formaterMontantIa('12.5')).toBe('$12.50');
    expect(formaterMontantIa('0.01')).toBe('$0.01');
    expect(formaterMontantIa('0.00123456')).toBe('$0.00123');
    expect(formaterMontantIa('0')).toBe('$0.00');
    expect(formaterMontantIa('12.5', 'XOF')).toMatch(/^13\s*F\sCFA$/);
    expect(formaterMontantIa('0.123456', 'XOF')).toMatch(/^0,123\s*F\sCFA$/);
  });

  it('un montant absent ou illisible se dit absent, jamais 0', () => {
    expect(formaterMontantIa(undefined)).toBe('—');
    expect(formaterMontantIa(null)).toBe('—');
    expect(formaterMontantIa('4e-11')).toBe('—');
    expect(equivalentXofIa('1', undefined)).toBeNull();
    expect(equivalentXofIa(undefined, '600')).toBeNull();
  });

  it('un tarif garde tous ses chiffres', () => {
    expect(formaterTarifIa('0.125')).toBe('$0.125');
    expect(formaterTarifIa('2')).toBe('$2.00');
    expect(formaterTarifIa('0.00000000004')).toBe('$0.00000000004');
    expect(formaterTarifIa('0.123456789012345678901234567890')).toBe('$0.12345678901234567890123456789');
  });

  it('compare au dernier chiffre, là où un nombre ne distingue plus rien', () => {
    expect(0.3 === Number('0.30000000000000000001')).toBe(true);
    expect(comparerMontantsIa('0.3', '0.30000000000000000001')).toBe(-1);
    expect(comparerMontantsIa('0.30000000000000000001', '0.3')).toBe(1);
    expect(comparerMontantsIa('2.50', '2.5')).toBe(0);
    expect(comparerMontantsIa('10', '9.99')).toBe(1);
  });

  it('multiplie sans erreur d’arrondi', () => {
    expect(0.1 * 3).not.toBe(0.3);
    expect(multiplierMontantsIa('0.1', '3')).toBe('0.3');
    expect(multiplierMontantsIa('0.00000000004', '600')).toBe('0.000000024');
    expect(multiplierMontantsIa('2.5', '4')).toBe('10');
    expect(multiplierMontantsIa('0', '600')).toBe('0');
  });

  it('lit une saisie avec la virgule, et refuse le reste', () => {
    expect(lireSaisieMontantIa(' 1,5 ')).toBe('1.5');
    expect(lireSaisieMontantIa('0')).toBe('0');
    expect(lireSaisieMontantIa('0.00000000004')).toBe('0.00000000004');
    expect(lireSaisieMontantIa('')).toBeNull();
    expect(lireSaisieMontantIa('1e-3')).toBeNull();
    expect(lireSaisieMontantIa('-1')).toBeNull();
  });
});
