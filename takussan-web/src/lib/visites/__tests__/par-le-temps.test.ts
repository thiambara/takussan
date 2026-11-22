import { describe, expect, it } from 'vitest';

import { bornesDeLOnglet, debutDeLaMinute } from '@/components/visits/onglet-des-visites';
import { filtreSpatieDesVisites } from '@/lib/queries/visits';
import type { PropertyVisit } from '@/types/visit';

import {
  cleDuCompte,
  ecartAuDebut,
  filtreDeLaVue,
  heuresLibresDeLaTranche,
  prochaineDuJour,
  tempsLibreEntre,
  vueDesVisites,
} from '../par-le-temps';

/** Mardi 10 novembre 2026, 10:12 à Dakar (UTC+0). */
const MAINTENANT = new Date('2026-11-10T10:12:00Z');

const p = (q: string) => new URLSearchParams(q);

function visite(o: Partial<PropertyVisit>): PropertyVisit {
  return { id: 1, property_id: 1, status: 'confirmed', scheduled_at: '2026-11-10T10:57:00Z', duration_minutes: 30, ...o };
}

describe('vueDesVisites — la vue que porte l’URL', () => {
  it('sans rien : Aujourd’hui ; `?vue=` borné aux vues', () => {
    expect(vueDesVisites(p(''))).toBe('today');
    expect(vueDesVisites(p('vue=to_close'))).toBe('to_close');
    expect(vueDesVisites(p('vue=inconnue'))).toBe('today');
  });

  it('`?tab=requested` (pastille du menu, bloc « Aujourd’hui ») ouvre « À confirmer » ; un autre onglet, les statuts', () => {
    expect(vueDesVisites(p('tab=requested'))).toBe('to_confirm');
    expect(vueDesVisites(p('tab=past'))).toBe('status');
    expect(vueDesVisites(p('tab=unassigned'))).toBe('status');
    // `?vue=` l'emporte sur `?tab=`.
    expect(vueDesVisites(p('vue=later&tab=requested'))).toBe('later');
  });
});

describe('filtreDeLaVue — la borne de chaque vue, celle que `counts` compte', () => {
  it('« Aujourd’hui » : le jour de Dakar, tout statut', () => {
    expect(filtreDeLaVue('today', MAINTENANT)).toEqual({ day: '2026-11-10' });
    // 23:59 à Dakar reste le même jour.
    expect(filtreDeLaVue('today', new Date('2026-11-10T23:59:00Z'))).toEqual({ day: '2026-11-10' });
  });

  it('« À confirmer » est EXACTEMENT le périmètre de « Demandées », que la pastille du menu compte', () => {
    expect(filtreDeLaVue('to_confirm', MAINTENANT)).toEqual(
      filtreSpatieDesVisites(bornesDeLOnglet('requested', debutDeLaMinute(MAINTENANT))),
    );
  });

  it('« À clore » : `filter[to_close]` ; « Plus tard » : confirmée, dès minuit demain à Dakar', () => {
    expect(filtreDeLaVue('to_close', MAINTENANT)).toEqual({ to_close: '1' });
    expect(filtreDeLaVue('later', MAINTENANT)).toEqual({ status: 'confirmed', scheduled_at_min: '2026-11-11T00:00:00Z' });
  });

  it('chaque vue lit la clé de `counts` qui la compte', () => {
    expect([cleDuCompte('today'), cleDuCompte('to_confirm'), cleDuCompte('to_close'), cleDuCompte('later'), cleDuCompte('status')]).toEqual([
      'today',
      'requested',
      'to_close',
      'later',
      'all',
    ]);
  });
});

describe('le déroulé du jour', () => {
  const plateau = visite({ id: 1, scheduled_at: '2026-11-10T10:57:00Z', duration_minutes: 30 });
  const terrain = visite({ id: 2, scheduled_at: '2026-11-10T16:55:00Z', duration_minutes: 45 });
  const annulee = visite({ id: 3, status: 'cancelled', scheduled_at: '2026-11-10T10:30:00Z' });
  const tranche = visite({ id: 4, status: 'scheduled', preferred_window: 'afternoon', scheduled_at: '2026-11-10T14:00:00Z' });

  it('la prochaine : la première dont la fin n’est pas passée, ni annulée ni sans heure fixée', () => {
    expect(prochaineDuJour([terrain, annulee, tranche, plateau], MAINTENANT)?.id).toBe(1);
    // Commencée à 10:57, elle reste la prochaine jusqu'à 11:27.
    expect(prochaineDuJour([terrain, plateau], new Date('2026-11-10T11:10:00Z'))?.id).toBe(1);
    expect(prochaineDuJour([terrain, plateau], new Date('2026-11-10T11:28:00Z'))?.id).toBe(2);
    expect(prochaineDuJour([plateau], new Date('2026-11-10T12:00:00Z'))).toBeNull();
  });

  it('le temps libre : du quart d’heure qui suit la fin de l’une au début de l’autre, au moins 30 min', () => {
    expect(tempsLibreEntre(plateau, terrain)).toEqual({ de: '2026-11-10T11:30:00.000Z', a: '2026-11-10T16:55:00Z' });
    // Une fin pile au quart d'heure ne s'arrondit pas.
    expect(tempsLibreEntre(visite({ scheduled_at: '2026-11-10T10:45:00Z' }), terrain)?.de).toBe('2026-11-10T11:15:00.000Z');
    expect(tempsLibreEntre(plateau, visite({ scheduled_at: '2026-11-10T11:50:00Z' }))).toBeNull();
  });

  it('« dans 45 min » avant, « depuis 12 min » après, rien au-delà de 12 h', () => {
    expect(ecartAuDebut('2026-11-10T10:57:00Z', MAINTENANT)).toEqual({ sens: 'dans', minutes: 45 });
    expect(ecartAuDebut('2026-11-10T10:57:00Z', new Date('2026-11-10T11:09:00Z'))).toEqual({ sens: 'depuis', minutes: 12 });
    expect(ecartAuDebut('2026-11-11T10:57:00Z', MAINTENANT)).toBeNull();
  });
});

describe('heuresLibresDeLaTranche', () => {
  const creneaux = ['09:30', '13:30', '14:00', '15:00', '15:30', '17:00'].map((h) => ({
    start: `2026-11-11T${h}:00Z`,
    label: h,
    available: h !== '14:00',
  }));

  it('les créneaux libres de la tranche, sans les pris ni ceux d’avant le délai', () => {
    expect(heuresLibresDeLaTranche(creneaux, 'afternoon', 0).map((c) => c.label)).toEqual(['15:00', '15:30']);
    expect(heuresLibresDeLaTranche(creneaux, 'morning', 0).map((c) => c.label)).toEqual(['09:30', '13:30']);
    expect(heuresLibresDeLaTranche(creneaux, 'evening', 0).map((c) => c.label)).toEqual(['17:00']);
    expect(heuresLibresDeLaTranche(creneaux, 'afternoon', Date.parse('2026-11-11T15:10:00Z')).map((c) => c.label)).toEqual(['15:30']);
  });
});
