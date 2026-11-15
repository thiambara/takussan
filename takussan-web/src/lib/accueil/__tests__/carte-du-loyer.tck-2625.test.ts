import { describe, expect, it } from 'vitest';

import type { LigneDuDu, ResumeDuLoyer } from '@/types/invoice';

import { carteDuLoyer } from '../carte-du-loyer';

const ligne = (surcharge: Partial<LigneDuDu> = {}): LigneDuDu => ({
  kind: 'rent',
  lease_payment_id: 501,
  lease_id: 40,
  payment_type: 'rent',
  due_date: '2026-11-05',
  period_start: '2026-11-01',
  period_end: '2026-11-30',
  amount: 150_000,
  currency: 'XOF',
  days_late: 4,
  payable_online: true,
  ...surcharge,
});

const resume = (surcharge: Partial<ResumeDuLoyer> = {}): ResumeDuLoyer => ({
  currency: 'XOF',
  total_due: 150_000,
  parts: { payable_online: 150_000, payable_at_agency: 0 },
  items: [ligne()],
  next_rent: null,
  schedule_state: 'due',
  lease: null,
  offline_payment: null,
  ...surcharge,
});

describe('carteDuLoyer — TCK-2625', () => {
  it('AC1 — un loyer de 250 000 F dont 100 000 F payés : la carte dit le RESTANT servi par l’API, et « Payer » vise cette échéance', () => {
    const c = carteDuLoyer(resume(), '2026-11-09');
    expect(c).toMatchObject({ genre: 'du', total: 150_000, lignes: 1 });
    expect(c?.genre === 'du' && c.aPayer?.lease_payment_id).toBe(501);
  });

  it('AC2 — en retard : le plus long retard des lignes', () => {
    const c = carteDuLoyer(resume({ items: [ligne({ days_late: 4 }), ligne({ lease_payment_id: 502, kind: 'charges', days_late: 2 })], total_due: 180_000 }), '2026-11-09');
    expect(c?.genre === 'du' && c.joursDeRetard).toBe(4);
  });

  it('la forme de la démo — des pénalités seules, sans retard servi ni paiement en ligne : ni retard ni « Payer »', () => {
    const penalite = ligne({ kind: 'late_fee', payment_type: 'rent', amount: 30_750, days_late: null, payable_online: false });
    const c = carteDuLoyer(resume({ items: [penalite, { ...penalite, lease_payment_id: 502 }], total_due: 61_500, parts: { payable_online: 0, payable_at_agency: 61_500 } }), '2026-11-13');
    expect(c).toMatchObject({ genre: 'du', total: 61_500, joursDeRetard: null, aPayer: null, aLAgence: 61_500 });
  });

  it('« Payer » vise le loyer ou les charges payables en ligne les plus anciens, jamais une pénalité', () => {
    const items = [
      ligne({ kind: 'late_fee', lease_payment_id: 400, due_date: '2026-09-05', payable_online: true }),
      ligne({ lease_payment_id: 502, due_date: '2026-11-05' }),
      ligne({ lease_payment_id: 501, due_date: '2026-10-05' }),
      ligne({ lease_payment_id: 499, due_date: '2026-09-05', payable_online: false }),
    ];
    const c = carteDuLoyer(resume({ items }), '2026-11-09');
    expect(c?.genre === 'du' && c.aPayer?.lease_payment_id).toBe(501);
  });

  it('AC3 — seule une restitution de caution à venir (aucun loyer émis après) : à jour, aucun montant à payer', () => {
    const c = carteDuLoyer(resume({ schedule_state: 'up_to_date', total_due: 0, items: [], next_rent: null }), '2026-11-09');
    expect(c).toEqual({ genre: 'aJour', devise: 'XOF', prochain: null, dans: null, aLAgence: 0 });
  });

  it('à jour : le prochain loyer et les jours jusqu’à lui', () => {
    const prochain = { lease_id: 40, lease_payment_id: 600, due_date: '2026-12-05', amount: 250_000, charges_amount: 0, currency: 'XOF', payable_online: true };
    const c = carteDuLoyer(resume({ schedule_state: 'up_to_date', total_due: 0, items: [], next_rent: prochain }), '2026-11-10');
    expect(c).toMatchObject({ genre: 'aJour', prochain, dans: 25 });
  });

  it('sans échéancier : une carte neutre ; sans bail : pas de carte', () => {
    expect(carteDuLoyer(resume({ schedule_state: 'none', total_due: 0, items: [] }), '2026-11-10')).toEqual({ genre: 'sansEcheance' });
    expect(carteDuLoyer(resume({ schedule_state: null, total_due: 0, items: [] }), '2026-11-10')).toBeNull();
    expect(carteDuLoyer(null, '2026-11-10')).toBeNull();
  });
});
