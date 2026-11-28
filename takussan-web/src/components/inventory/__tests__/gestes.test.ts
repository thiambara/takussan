import { describe, expect, it } from 'vitest';

import { AUCUN_GESTE_D_ETAT_DES_LIEUX, gestesDeLEtatDesLieux } from '../gestes';
import type { Inventory } from '@/types/inventory';

/**
 * TCK-3011 (ADR-0139) — les gestes de l'état des lieux suivent ce que l'API sert (`abilities`,
 * `can_sign_as`), jamais le statut : un brouillon sans `edit` ne se modifie pas, et sans `abilities`
 * rien ne s'offre, même avec des rôles de signature.
 */
type Lu = Pick<Inventory, 'abilities' | 'can_sign_as' | 'sign_on_behalf_of'>;
const lu = (partiel: Partial<Lu>): Lu => ({ abilities: undefined, can_sign_as: [], sign_on_behalf_of: null, ...partiel });

describe('gestesDeLEtatDesLieux', () => {
  it('sans `abilities`, aucun geste — même avec des rôles de signature servis', () => {
    expect(gestesDeLEtatDesLieux(lu({ can_sign_as: ['tenant', 'landlord', 'tenant_onsite'] }))).toEqual(AUCUN_GESTE_D_ETAT_DES_LIEUX);
  });

  it('`edit` et `submit` décident seuls : `update` (le lecteur conduit) n’ouvre ni la modification ni l’envoi', () => {
    expect(gestesDeLEtatDesLieux(lu({ abilities: { update: true, edit: false, submit: false } }))).toMatchObject({ modifier: false, envoyer: false });
    expect(gestesDeLEtatDesLieux(lu({ abilities: { update: false, edit: true, submit: true } }))).toMatchObject({ modifier: true, envoyer: true });
  });

  it('contester suit `dispute`', () => {
    expect(gestesDeLEtatDesLieux(lu({ abilities: { update: false, dispute: true } })).contester).toBe(true);
    expect(gestesDeLEtatDesLieux(lu({ abilities: { update: false } })).contester).toBe(false);
  });

  it('la signature sur place : qui conduit, avec le rôle sur place ou le bailleur pour le compte de qui il signe', () => {
    expect(gestesDeLEtatDesLieux(lu({ abilities: { update: true }, can_sign_as: ['tenant_onsite'] })).signerSurPlace).toBe(true);
    expect(gestesDeLEtatDesLieux(lu({ abilities: { update: false }, can_sign_as: ['tenant_onsite'] })).signerSurPlace).toBe(false);
    expect(gestesDeLEtatDesLieux(lu({ abilities: { update: true }, can_sign_as: ['landlord'] })).signerSurPlace).toBe(false);
    expect(
      gestesDeLEtatDesLieux(lu({ abilities: { update: true }, can_sign_as: ['landlord'], sign_on_behalf_of: { id: 9, full_name: 'Awa Diop' } })).signerSurPlace,
    ).toBe(true);
  });

  it('les deux canevas suivent `can_sign_as`, que l’API ne sert plus pour un rôle déjà signé', () => {
    expect(gestesDeLEtatDesLieux(lu({ abilities: { update: false }, can_sign_as: ['tenant'] }))).toMatchObject({ signerCommeLocataire: true, signerCommeBailleur: false });
    expect(gestesDeLEtatDesLieux(lu({ abilities: { update: false }, can_sign_as: ['landlord'] }))).toMatchObject({ signerCommeLocataire: false, signerCommeBailleur: true });
  });
});
