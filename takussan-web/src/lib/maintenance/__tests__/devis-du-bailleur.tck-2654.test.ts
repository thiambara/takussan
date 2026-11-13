import { describe, expect, it } from 'vitest';

import { MAINTENANCE_FINISHED_STATUSES } from '@/types/maintenance';
import {
  CHAMPS_DES_INTERVENTIONS_DU_BAILLEUR,
  montantDUneLigne,
  plafondARappeler,
  sousLeSeuil,
  STATUT_DU_DEVIS_A_DECIDER,
  STATUTS_EN_COURS_DU_BAILLEUR,
  type FicheDuBailleur,
} from '../devis-du-bailleur';

const fiche = (seuil: unknown) => ({ id: 1, owner_approval_threshold: seuil }) as unknown as FicheDuBailleur;

describe('devis du bailleur — TCK-2654, lot 3', () => {
  it('« en cours » ne reprend ni le devis à décider, ni ce qui est terminé ou clos', () => {
    expect(STATUTS_EN_COURS_DU_BAILLEUR).not.toContain(STATUT_DU_DEVIS_A_DECIDER);
    for (const fini of [...MAINTENANCE_FINISHED_STATUSES, 'rejected'] as const) expect(STATUTS_EN_COURS_DU_BAILLEUR).not.toContain(fini);
  });

  it('la ligne lit la file (`status`, `assigned_to`, `scheduled_at`, `queue_entered_at`) et le coût', () => {
    for (const c of ['status', 'assigned_to', 'scheduled_at', 'queue_entered_at', 'quote_amount', 'actual_cost', 'quote_decision_at'])
      expect(CHAMPS_DES_INTERVENTIONS_DU_BAILLEUR).toContain(c);
  });

  it('le montant d’une ligne : le coût réel, sinon le devis, sinon l’estimation', () => {
    expect(montantDUneLigne({ actual_cost: 70000, quote_amount: 65000, estimated_cost: 60000 })).toBe(70000);
    expect(montantDUneLigne({ actual_cost: null, quote_amount: 65000, estimated_cost: 60000 })).toBe(65000);
    expect(montantDUneLigne({ actual_cost: null, quote_amount: null, estimated_cost: 60000 })).toBe(60000);
    expect(montantDUneLigne({ actual_cost: null, quote_amount: null, estimated_cost: null })).toBeNull();
  });

  it('le plafond n’est rappelé que servi ET fixé', () => {
    expect(plafondARappeler(fiche(150000))).toBe(150000);
    expect(plafondARappeler(fiche(null))).toBeNull();
    expect(plafondARappeler({ id: 1 } as unknown as FicheDuBailleur)).toBeNull();
    expect(plafondARappeler(undefined)).toBeNull();
  });

  it('« sous le seuil » : au plus égal au plafond (ADR-0037 § 2, `exceeds` est strict) ; faux sans plafond ou sans devis', () => {
    expect(sousLeSeuil(65000, 150000)).toBe(true);
    expect(sousLeSeuil(150000, 150000)).toBe(true);
    expect(sousLeSeuil('150000.00', 150000)).toBe(true);
    expect(sousLeSeuil(150000.01, 150000)).toBe(false);
    expect(sousLeSeuil(65000, null)).toBe(false);
    expect(sousLeSeuil(null, 150000)).toBe(false);
  });
});
