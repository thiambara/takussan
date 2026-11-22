/**
 * TCK-2875 — ce que la fiche et la liste d'une candidature dérivent des clés de l'API : « Expire
 * demain », la synthèse de la décision, le geste « Demander » tu 24 h, et les visites du client
 * bornées au bien.
 */
import { describe, expect, it } from 'vitest';

import type { EntreeDuFil } from '@/lib/queries/customer-timeline';
import { demandeeRecemment, expireBientot, syntheseDeLaCandidature, visitesEffectueesSurLeBien } from '../candidature';

const MAINTENANT = new Date('2026-11-12T10:00:00Z');
const dans = (heures: number) => new Date(MAINTENANT.getTime() + heures * 3_600_000).toISOString();

describe('expireBientot (TCK-2875)', () => {
  it('« Expire demain » à H−20, pas à H−60, pas sur une confirmée, pas sur une échéance passée', () => {
    expect(expireBientot({ status: 'pending', response_deadline: dans(20), expires_at: null }, MAINTENANT)).toBe(true);
    expect(expireBientot({ status: 'pending', response_deadline: dans(60), expires_at: null }, MAINTENANT)).toBe(false);
    expect(expireBientot({ status: 'confirmed', response_deadline: dans(20), expires_at: dans(20) }, MAINTENANT)).toBe(false);
    expect(expireBientot({ status: 'pending', response_deadline: dans(-1), expires_at: null }, MAINTENANT)).toBe(false);
  });

  it('`response_deadline` l’emporte sur `expires_at`, qui sert de repli', () => {
    expect(expireBientot({ status: 'pending', response_deadline: dans(60), expires_at: dans(20) }, MAINTENANT)).toBe(false);
    expect(expireBientot({ status: 'pending', response_deadline: null, expires_at: dans(20) }, MAINTENANT)).toBe(true);
    expect(expireBientot({ status: 'pending', response_deadline: null, expires_at: null }, MAINTENANT)).toBe(false);
  });
});

describe('syntheseDeLaCandidature (TCK-2875)', () => {
  it('nomme la PREMIÈRE pièce manquante, dans l’ordre de l’API', () => {
    const s = syntheseDeLaCandidature({ income_to_rent_ratio: 3.2, has_guarantor: true, dossier: { received: 3, required: 5, missing: ['guarantor_commitment', 'guarantor_identity'] } });
    expect(s).toEqual({ rapport: 3.2, garant: true, manque: 'guarantor_commitment' });
  });

  it('une clé non servie ne dit rien ; servie et vide, elle dit son absence', () => {
    expect(syntheseDeLaCandidature({})).toEqual({ rapport: undefined, garant: undefined, manque: undefined });
    expect(syntheseDeLaCandidature({ income_to_rent_ratio: null, has_guarantor: false, dossier: { received: 3, required: 3, missing: [] } })).toEqual({
      rapport: null,
      garant: false,
      manque: null,
    });
  });
});

describe('demandeeRecemment (TCK-2875)', () => {
  it('tu 24 h après une demande, libre ensuite ou sans demande', () => {
    expect(demandeeRecemment(dans(-3), MAINTENANT)).toBe(true);
    expect(demandeeRecemment(dans(-25), MAINTENANT)).toBe(false);
    expect(demandeeRecemment(null, MAINTENANT)).toBe(false);
  });
});

describe('visitesEffectueesSurLeBien (TCK-2875)', () => {
  const visite = (id: number, bien: number): EntreeDuFil => ({
    type: 'visit',
    id,
    at: '2026-11-05T09:00:00Z',
    milestone: 'confirmed',
    status: 'completed',
    scheduled_at: '2026-11-07T11:00:00Z',
    property: { id: bien, title: 'F3' },
  });
  const compteRendu = (id: number, visitId: number, corps: string): EntreeDuFil => ({
    type: 'note',
    id,
    at: '2026-11-07T12:00:00Z',
    kind: 'visit_report',
    body: corps,
    pinned: true,
    property_visit_id: visitId,
    author: { id: 2, name: 'Sokhna Sène' },
    report: { visit_id: visitId, outcome: 'interested', objections: [], follow_up: null },
  });

  it('garde le compte rendu d’une visite de CE bien, avec son agent, son verdict, sa note et le jour de la visite', () => {
    const faits = visitesEffectueesSurLeBien([compteRendu(1, 11, 'Veut revoir la cuisine'), visite(11, 9)], 9);
    expect(faits).toEqual([{ cle: 'visite-11', at: '2026-11-07T11:00:00Z', agent: 'Sokhna Sène', verdict: 'interested', note: 'Veut revoir la cuisine' }]);
  });

  it('écarte la visite d’un autre bien, et un compte rendu dont la visite n’est pas au fil', () => {
    const faits = visitesEffectueesSurLeBien([compteRendu(1, 12, 'Autre bien'), visite(12, 99), compteRendu(2, 13, 'Visite inconnue')], 9);
    expect(faits).toEqual([]);
  });
});
