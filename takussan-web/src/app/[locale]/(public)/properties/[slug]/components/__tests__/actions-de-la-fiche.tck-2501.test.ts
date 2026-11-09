/** TCK-2501 — décisions 3a (la visite d'abord pour une location au dossier) et 4a (WhatsApp d'abord). */
import { describe, expect, it } from 'vitest';

import { actionsDuContrat, canalPrincipal } from '../actions-de-la-fiche';

describe('canalPrincipal (4a)', () => {
  it('WhatsApp seulement quand le contact a un numéro déclaré WhatsApp', () => {
    expect(canalPrincipal({ has_phone: true, has_whatsapp: true }, true)).toBe('whatsapp');
  });

  it('un numéro sans WhatsApp : Appeler', () => {
    expect(canalPrincipal({ has_phone: true, has_whatsapp: false }, true)).toBe('call');
    expect(canalPrincipal({ has_phone: true }, true)).toBe('call');
  });

  it('aucun numéro : Écrire', () => {
    expect(canalPrincipal({ has_phone: false, has_whatsapp: false }, true)).toBe('message');
    expect(canalPrincipal({}, true)).toBe('message');
    expect(canalPrincipal(null, true)).toBe('message');
  });

  it('aucun numéro et personne à qui écrire (soi-même) : aucun canal', () => {
    expect(canalPrincipal({ has_phone: false }, false)).toBeNull();
  });
});

describe('actionsDuContrat (3a)', () => {
  it('location au mois : Visiter d’abord, le dossier ensuite', () => {
    expect(actionsDuContrat({ contract_type: 'rent', rent_period: 'monthly' })).toEqual({ primaire: 'visit', secondaire: 'apply' });
    expect(actionsDuContrat({ contract_type: 'rent', rent_period: null })).toEqual({ primaire: 'visit', secondaire: 'apply' });
  });

  it('vente : l’action primaire d’aujourd’hui (Faire une offre), la visite en second', () => {
    expect(actionsDuContrat({ contract_type: 'sale' })).toEqual({ primaire: 'offer', secondaire: 'visit' });
  });

  it('location courte : Réserver reste primaire', () => {
    expect(actionsDuContrat({ contract_type: 'rent', rent_period: 'daily' })).toEqual({ primaire: 'reserve', secondaire: 'visit' });
  });
});
