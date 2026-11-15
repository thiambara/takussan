import { describe, expect, it } from 'vitest';

import {
  closableParCompteRendu,
  compteRenduAFaire,
  compteRenduLisible,
  echeanceDeRelance,
  etapeAProposer,
  lienDInvitation,
  suitesDeLaVisite,
} from '../compte-rendu';
import type { PropertyVisit } from '@/types/visit';

const MAINTENANT = Date.parse('2026-11-11T12:00:00Z');
const visite = (v: Partial<PropertyVisit>): PropertyVisit => ({ id: 1, property_id: 2, ...v });

describe('TCK-2581 — compte rendu : ce qui se décide sans écran', () => {
  it('la clé `report` ABSENTE ferme tout (client, visiteur, bailleur) ; `null` est lisible et à faire', () => {
    expect(compteRenduLisible(visite({ status: 'completed' }))).toBe(false);
    expect(compteRenduLisible(visite({ status: 'completed', report: null }))).toBe(true);
    expect(compteRenduAFaire(visite({ status: 'completed' }), MAINTENANT)).toBe(false);
    expect(compteRenduAFaire(visite({ status: 'completed', report: null }), MAINTENANT)).toBe(true);
  });

  it('closable : terminée, ou confirmée dont l\'heure est passée — jamais à venir ni planifiée', () => {
    expect(closableParCompteRendu(visite({ status: 'completed' }), MAINTENANT)).toBe(true);
    expect(closableParCompteRendu(visite({ status: 'confirmed', scheduled_at: '2026-11-11T10:00:00Z' }), MAINTENANT)).toBe(true);
    expect(closableParCompteRendu(visite({ status: 'confirmed', scheduled_at: '2026-11-11T15:00:00Z' }), MAINTENANT)).toBe(false);
    expect(closableParCompteRendu(visite({ status: 'scheduled', scheduled_at: '2026-11-11T10:00:00Z' }), MAINTENANT)).toBe(false);
    expect(closableParCompteRendu(visite({ status: 'cancelled' }), MAINTENANT)).toBe(false);
  });

  it('location : inviter à candidater (conseillé si intéressé) et saisir sa candidature, bail en fin', () => {
    const { suites, conseillee } = suitesDeLaVisite('interested', 'application');
    expect(conseillee).toBe('invite_apply');
    expect(suites).toEqual(['invite_apply', 'record_booking', 'second_visit', 'propose_properties', 'remind', 'create_lease']);
  });

  it('vente : inviter à faire une offre ; jamais de bail', () => {
    const { suites, conseillee } = suitesDeLaVisite('interested', 'offer');
    expect(conseillee).toBe('invite_offer');
    expect(suites).toContain('record_booking');
    expect(suites).not.toContain('create_lease');
    expect(suites).not.toContain('invite_apply');
  });

  it('séjour court : aucune suite d\'engagement (ni invitation, ni saisie, ni bail)', () => {
    const { suites, conseillee } = suitesDeLaVisite('interested', 'stay');
    expect(conseillee).toBeNull();
    expect(suites).toEqual(['second_visit', 'propose_properties', 'remind']);
  });

  it('« À réfléchir » remonte la relance en tête ; « Pas intéressé », les autres biens', () => {
    expect(suitesDeLaVisite('thinking', 'application').suites[0]).toBe('remind');
    expect(suitesDeLaVisite('not_interested', 'application').suites[0]).toBe('propose_properties');
  });

  it('l\'interrupteur « Qualifié » : intéressé ET fiche encore Lead ou Prospect', () => {
    expect(etapeAProposer('interested', 'prospect')).toBe(true);
    expect(etapeAProposer('interested', 'lead')).toBe(true);
    expect(etapeAProposer('interested', 'qualified')).toBe(false);
    expect(etapeAProposer('thinking', 'prospect')).toBe(false);
    expect(etapeAProposer('interested', null)).toBe(false);
  });

  it('le lien d\'invitation rouvre la boîte de la fiche publique : langue, slug, `?action=reserver`', () => {
    expect(lienDInvitation('http://localhost:3000/', 'fr', 'studio-yoff')).toBe('http://localhost:3000/fr/properties/studio-yoff?action=reserver');
    expect(lienDInvitation('https://x.sn', 'en', 'a b')).toBe('https://x.sn/en/properties/a%20b?action=reserver');
  });

  it('la relance tombe à J+N, 09:00 à Dakar (UTC)', () => {
    expect(echeanceDeRelance(new Date('2026-11-11T22:30:00Z'), 2)).toBe('2026-11-13T09:00:00.000Z');
  });
});
