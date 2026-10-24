/**
 * TCK-1834 (P146.04) — `lireTable` lit une table de statut typée `Record<Union, …>` avec une valeur
 * que l'API sert en `string`. Une valeur hors de l'union, `null`, ou une clé héritée de l'objet
 * (`constructor`, `toString`) rendent `undefined` : l'appelant garde son repli (ton neutre,
 * libellé brut), exactement comme avant que les tables soient typées.
 */
import { describe, expect, it } from 'vitest';
import { estCleDe, lireTable } from '@/lib/table-de-statut';

type Statut = 'active' | 'blocked';
const TONS: Record<Statut, string> = { active: 'success', blocked: 'danger' };

describe('lireTable (TCK-1834)', () => {
  it('rend la valeur d\'un cas de l\'union', () => {
    expect(lireTable(TONS, 'active')).toBe('success');
    expect(lireTable(TONS, 'blocked')).toBe('danger');
  });

  it('rend undefined pour un statut inconnu, null ou absent', () => {
    expect(lireTable(TONS, 'suspended')).toBeUndefined();
    expect(lireTable(TONS, null)).toBeUndefined();
    expect(lireTable(TONS, undefined)).toBeUndefined();
  });

  it('ne lit pas les clés héritées de l\'objet', () => {
    expect(lireTable(TONS, 'constructor')).toBeUndefined();
    expect(lireTable(TONS, 'toString')).toBeUndefined();
  });
});

describe('estCleDe (TCK-1834)', () => {
  it('reconnaît les seuls cas de la table', () => {
    expect(estCleDe(TONS, 'active')).toBe(true);
    expect(estCleDe(TONS, 'deleted')).toBe(false);
    expect(estCleDe(TONS, 'constructor')).toBe(false);
    expect(estCleDe(TONS, null)).toBe(false);
  });
});
