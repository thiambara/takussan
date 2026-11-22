/**
 * TCK-2580 — la règle de nature (miroir de `BookingKind::forProperty`), l'écart au prix, le corps
 * que l'API admet, et la pose des deux formes de 422 sur un champ.
 */
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api';
import { corpsDeLaDemande, ecartAuPrix, erreursDeLaDemande, natureDuBien } from '../saisie-de-demande';

describe('natureDuBien', () => {
  it.each([
    [{ contract_type: 'sale', rent_period: null }, 'offer'],
    [{ contract_type: 'rent', rent_period: 'monthly' }, 'application'],
    [{ contract_type: 'rent', rent_period: 'yearly' }, 'application'],
    [{ contract_type: 'rent', rent_period: null }, 'application'],
    [{ contract_type: 'rent', rent_period: 'daily' }, 'stay'],
    [{ contract_type: 'rent', rent_period: 'weekly' }, 'stay'],
  ] as const)('%o → %s', (bien, nature) => {
    expect(natureDuBien(bien)).toBe(nature);
  });
});

describe('ecartAuPrix', () => {
  it('85 M sur 95 M : −10,5 %', () => {
    expect(ecartAuPrix(85_000_000, 95_000_000)).toBeCloseTo(-0.10526, 4);
  });
  it('rien à comparer sans l’un des deux, ou sur un prix nul', () => {
    expect(ecartAuPrix(null, 95)).toBeNull();
    expect(ecartAuPrix(10, null)).toBeNull();
    expect(ecartAuPrix(10, 0)).toBeNull();
  });
});

describe('corpsDeLaDemande', () => {
  const base = { propertyId: 40, customerId: 269, montant: 250000, dateEntree: '2026-12-01', validite: '2026-12-15', message: '  ' };
  it('candidature : la date d’entrée, jamais la validité ; un message blanc ne part pas', () => {
    expect(corpsDeLaDemande({ ...base, nature: 'application' })).toEqual({
      kind: 'application',
      property_id: 40,
      customer_id: 269,
      total_amount: 250000,
      start_date: '2026-12-01',
    });
  });
  it('offre : la validité, jamais la date d’entrée', () => {
    expect(corpsDeLaDemande({ ...base, nature: 'offer', message: 'Ferme.' })).toEqual({
      kind: 'offer',
      property_id: 40,
      customer_id: 269,
      total_amount: 250000,
      offer_expires_at: '2026-12-15',
      notes: 'Ferme.',
    });
  });
});

describe('erreursDeLaDemande', () => {
  it('un refus {code} connu se pose sur son champ, par sa clé', () => {
    const e = new ApiError(422, { code: 'booking.kind_mismatch', message: '…' });
    expect(erreursDeLaDemande(e)).toEqual({ champs: { nature: { cle: 'booking.kind_mismatch' } }, pose: true });
  });
  it('une erreur de validation se pose sur son champ, par sa prose', () => {
    const e = new ApiError(422, { message: '…', errors: { start_date: ['Date requise.'] } });
    expect(erreursDeLaDemande(e)).toEqual({ champs: { dateEntree: { texte: 'Date requise.' } }, pose: true });
  });
  it('ce qui ne se pose nulle part revient vide', () => {
    expect(erreursDeLaDemande(new ApiError(500, { message: 'boom' })).pose).toBe(false);
    expect(erreursDeLaDemande(new Error('réseau')).pose).toBe(false);
  });
});
