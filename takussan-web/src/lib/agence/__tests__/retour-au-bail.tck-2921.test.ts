import { describe, expect, it } from 'vitest';

import { lienDuBail, lienVersLesReglagesDepuisLeBail, retourAuBailDepuis } from '../retour-au-bail';

/**
 * TCK-2921 — l'aller-retour bail ↔ réglages : seuls des identifiants voyagent, l'adresse du bail se
 * reconstruit toujours sous `/app/leases/new` (aucune redirection ouverte), et c'est la même adresse
 * — donc la même clé de brouillon (`cleDuBrouillonDeBail`).
 */
describe('retour au bail', () => {
  it('aller puis retour : la même adresse de bail', () => {
    const aller = lienVersLesReglagesDepuisLeBail({ bookingId: 4, propertyId: 11, customerId: 7, locataireId: 7 });
    expect(aller).toBe('/app/agency/lease-settings?depuis=bail&booking_id=4&property=11&customer=7&locataire=7');
    const retour = retourAuBailDepuis(new URL(aller, 'https://x.test').searchParams);
    expect(retour).toEqual({ bookingId: 4, propertyId: 11, customerId: 7, locataireId: 7 });
    expect(lienDuBail(retour!)).toBe('/app/leases/new?booking_id=4&property=11&customer=7');
  });

  it('sans `depuis=bail`, aucun retour', () => {
    expect(retourAuBailDepuis({ property: '11' })).toBeNull();
    expect(retourAuBailDepuis(undefined)).toBeNull();
  });

  it('un identifiant qui n’est pas un entier positif est ignoré ; l’adresse ne sort jamais du bail', () => {
    const retour = retourAuBailDepuis({ depuis: 'bail', property: '//evil.test', customer: '-3', booking_id: '1e3', locataire: ['9', '10'] });
    expect(retour).toEqual({ bookingId: undefined, propertyId: undefined, customerId: undefined, locataireId: 9 });
    expect(lienDuBail(retour!)).toBe('/app/leases/new');
  });
});
