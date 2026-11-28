import { describe, expect, it } from 'vitest';
import type { PropertyVisit } from '@/types/visit';
import { gestesDeLaVisite } from '../gestes';

/**
 * TCK-3005 (ADR-0139) — la fiche décide de ses gestes par une fonction pure sur `abilities` : chaque geste
 * suit SA clé, rien ne se déduit d'un rôle ni du statut, et sans `abilities` aucun geste.
 */
const MAINTENANT = new Date('2026-11-10T12:00:00Z');
type Cles = NonNullable<PropertyVisit['abilities']>;
const TOUT_REFUSE: Cles = {
  manage: true,
  confirm: false,
  complete: false,
  no_show: false,
  cancel: false,
  reschedule: false,
  claim: false,
  assign: false,
  propose: false,
};

function visite(o: Partial<PropertyVisit> = {}): PropertyVisit {
  return {
    id: 1,
    property_id: 10,
    status: 'confirmed',
    scheduled_at: '2026-11-10T10:00:00Z',
    property: { id: 10, title: 'Villa', slug: 'villa' },
    abilities: TOUT_REFUSE,
    ...o,
  } as PropertyVisit;
}

describe('gestesDeLaVisite', () => {
  it('sans `abilities`, aucun geste (pas d’affichage optimiste)', () => {
    const g = gestesDeLaVisite(visite({ abilities: undefined }), MAINTENANT);
    expect(Object.values(g).every((v) => v === false)).toBe(true);
  });

  it('`manage` seul n’ouvre aucun geste : chaque geste suit sa clé', () => {
    const g = gestesDeLaVisite(visite(), MAINTENANT);
    expect(Object.values(g).every((v) => v === false)).toBe(true);
  });

  it.each([
    ['confirm', 'confirmer'],
    ['complete', 'terminer'],
    ['no_show', 'absent'],
    ['reschedule', 'replanifier'],
    ['cancel', 'annuler'],
    ['claim', 'prendreEnCharge'],
    ['propose', 'proposer'],
    ['assign', 'attribuer'],
  ] as const)('`%s` accordé ouvre « %s », et lui seul', (cle, geste) => {
    const g = gestesDeLaVisite(visite({ abilities: { ...TOUT_REFUSE, [cle]: true } }), MAINTENANT);
    expect(g[geste]).toBe(true);
    expect(Object.entries(g).filter(([, v]) => v).map(([k]) => k)).toEqual([geste]);
  });

  it('le statut ne rouvre rien : une visite « scheduled » sans `confirm` ne se confirme pas', () => {
    const g = gestesDeLaVisite(visite({ status: 'scheduled' }), MAINTENANT);
    expect(g.confirmer).toBe(false);
  });

  it('présentation : une demande à venir ne se termine pas avant son heure ; confirmée, si', () => {
    const avant = new Date('2026-11-10T09:00:00Z');
    const complete = { ...TOUT_REFUSE, complete: true };
    expect(gestesDeLaVisite(visite({ status: 'scheduled', abilities: complete }), avant).terminer).toBe(false);
    expect(gestesDeLaVisite(visite({ status: 'scheduled', abilities: complete }), MAINTENANT).terminer).toBe(true);
    expect(gestesDeLaVisite(visite({ status: 'confirmed', abilities: complete }), avant).terminer).toBe(true);
  });

  it('présentation : « Proposer » demande la grille du bien (`slug`)', () => {
    const propose = { ...TOUT_REFUSE, propose: true };
    expect(gestesDeLaVisite(visite({ abilities: propose, property: { id: 10, title: 'Villa', slug: null } as PropertyVisit['property'] }), MAINTENANT).proposer).toBe(false);
  });
});
