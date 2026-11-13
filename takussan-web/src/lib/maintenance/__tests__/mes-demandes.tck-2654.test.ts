import { describe, expect, it } from 'vitest';

import type { InterventionEnFile } from '@/lib/maintenance/files';
import { CHAMPS_DES_DEMANDES_DU_LOCATAIRE, jourRelatif, repartirDemandes } from '../mes-demandes';

const d = (id: number, status: InterventionEnFile['status'], completed_at: string | null = null) =>
  ({ id, status, completed_at }) as unknown as InterventionEnFile;

describe('mes demandes du locataire — TCK-2654', () => {
  it('la liste ne lit aucune colonne de coût ni de devis', () => {
    expect(CHAMPS_DES_DEMANDES_DU_LOCATAIRE.filter((c) => /cost|quote/.test(c))).toEqual([]);
  });

  it('répartit en « à confirmer » (la plus récente d’abord), « en cours » et « closes »', () => {
    const r = repartirDemandes([
      d(1, 'open'),
      d(2, 'completed', '2026-11-10T10:00:00Z'),
      d(3, 'closed'),
      d(4, 'completed', '2026-11-12T10:00:00Z'),
      d(5, 'assigned'),
      d(6, 'cancelled'),
    ]);
    expect(r.aConfirmer.map((x) => x.id)).toEqual([4, 2]);
    expect(r.enCours.map((x) => x.id)).toEqual([1, 5]);
    expect(r.closes.map((x) => x.id)).toEqual([3, 6]);
  });

  it('le jour relatif se lit au jour calendaire', () => {
    const jourDe = (x: Date) => x.toISOString().slice(0, 10);
    const maintenant = new Date('2026-11-13T00:30:00Z');
    expect(jourRelatif('2026-11-13T23:59:00Z', maintenant, jourDe)).toBe('aujourdhui');
    expect(jourRelatif('2026-11-12T23:59:00Z', maintenant, jourDe)).toBe('hier');
    expect(jourRelatif('2026-11-14T08:00:00Z', maintenant, jourDe)).toBe('demain');
    expect(jourRelatif('2026-11-01T08:00:00Z', maintenant, jourDe)).toBe('autre');
    expect(jourRelatif(null, maintenant, jourDe)).toBe('autre');
    expect(jourRelatif('pas une date', maintenant, jourDe)).toBe('autre');
  });
});

describe('lecture des demandes du locataire — TCK-2654', () => {
  it('aucune colonne de coût ni de devis, ni le demandeur inclus', async () => {
    const { PARAMETRES_DES_DEMANDES_DU_LOCATAIRE: p } = await import('@/lib/queries/maintenance-signalement');
    expect(p.fields.maintenance_requests.filter((c) => /cost|quote/.test(c))).toEqual([]);
    expect(p.include).toEqual(['property', 'assignee']);
  });
});
