/**
 * TCK-2653 — la fiche d'une intervention, sans rendu : le geste principal de chaque file, ce
 * qu'« Autre action » propose (rien que le serveur n'ait permis, jamais « Terminée » en statut nu),
 * et les créneaux proposés au dispatch, au fuseau de Dakar.
 */
import { describe, expect, it } from 'vitest';

import { autresActions, corpsDAssignation, creneauxProposes, etapesDeLaFrise, gestePrincipal } from '@/lib/maintenance/fiche';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import type { MaintenanceStatus } from '@/types/maintenance';

type Abilities = NonNullable<InterventionEnFile['abilities']>;

const ouverte = (transitions: MaintenanceStatus[], extra: Partial<Abilities> = {}): Abilities =>
  ({ transitions, can_assign: true, can_complete: true, can_request_quote: true, can_decide_quote: false, ...extra }) as Abilities;

describe('gestePrincipal — un geste par file', () => {
  it('à dispatcher : choisir un prestataire, si l’agence peut assigner', () => {
    expect(gestePrincipal({ file: 'a_dispatcher', assigned_to: null, abilities: ouverte([]) })).toBe('choisir');
    expect(gestePrincipal({ file: 'a_dispatcher', assigned_to: null, abilities: ouverte([], { can_assign: false }) })).toBe('aucun');
  });

  it('les autres files', () => {
    expect(gestePrincipal({ file: 'en_retard', assigned_to: 20, abilities: ouverte([]) })).toBe('relancer');
    expect(gestePrincipal({ file: 'chez_le_bailleur', assigned_to: 20, abilities: ouverte([]) })).toBe('bailleur');
    expect(gestePrincipal({ file: 'en_cours', assigned_to: 20, abilities: ouverte([]) })).toBe('suivi');
    expect(gestePrincipal({ file: 'a_confirmer', assigned_to: 20, abilities: ouverte([]) })).toBe('confirmer');
    expect(gestePrincipal({ file: 'terminees', assigned_to: 20, abilities: ouverte([]) })).toBe('aucun');
    expect(gestePrincipal({ file: null, assigned_to: null, abilities: ouverte([]) })).toBe('aucun');
  });

  it('un devis qui attend l’agence prime sur la file', () => {
    expect(gestePrincipal({ file: 'en_cours', assigned_to: 20, abilities: ouverte([], { can_decide_quote: true }) })).toBe('devis');
  });
});

describe('autresActions — rien que le serveur n’ait permis', () => {
  // Les abilities de la demande #8 de la démo (open, à dispatcher), relevées le 2026-11-13.
  const huit = { file: 'a_dispatcher', status: 'open', assigned_to: null, abilities: ouverte(['acknowledged', 'assigned', 'in_progress', 'cancelled']) } as const;

  it('#8 : « Prendre en compte » et « Marquer en cours », jamais « Assignée » ni « Terminée » en statut nu', () => {
    const a = autresActions(huit);
    expect(a.transitions).toEqual(['acknowledged', 'in_progress']);
    expect(a.devis).toBe(true);
    expect(a.priorite).toBe(true);
    expect(a.annuler).toBe(true);
    // Le rapport de fin ne se propose pas sans prestataire.
    expect(a.rapport).toBe(false);
  });

  it('« completed » permise par le serveur n’apparaît pas en transition : elle passe par le rapport', () => {
    const a = autresActions({ file: 'en_cours', status: 'in_progress', assigned_to: 20, abilities: ouverte(['completed', 'cancelled']) });
    expect(a.transitions).toEqual([]);
    expect(a.rapport).toBe(true);
  });

  it('sans abilities, aucune transition ni annulation', () => {
    const a = autresActions({ file: 'a_dispatcher', status: 'open', assigned_to: null, abilities: undefined });
    expect(a).toEqual({ devis: false, transitions: [], priorite: false, rapport: false, annuler: false });
  });

  it('la priorité ne se change plus sur une demande close ou annulée', () => {
    expect(autresActions({ file: 'terminees', status: 'closed', assigned_to: 20, abilities: ouverte([]) }).priorite).toBe(false);
    expect(autresActions({ file: 'terminees', status: 'cancelled', assigned_to: 20, abilities: ouverte([]) }).priorite).toBe(false);
  });
});

describe('creneauxProposes — au fuseau de Dakar (UTC+0)', () => {
  it('le matin : aujourd’hui 16 h, demain 9 h et 14 h', () => {
    expect(creneauxProposes(new Date('2026-11-13T10:30:00Z'))).toEqual([
      { cle: 'aujourdhui16', debut: '2026-11-13T16:00:00Z' },
      { cle: 'demain9', debut: '2026-11-14T09:00:00Z' },
      { cle: 'demain14', debut: '2026-11-14T14:00:00Z' },
    ]);
  });

  it('à partir de 16 h, plus de créneau du jour ; le lendemain passe le mois', () => {
    expect(creneauxProposes(new Date('2026-11-30T16:00:00Z'))).toEqual([
      { cle: 'demain9', debut: '2026-12-01T09:00:00Z' },
      { cle: 'demain14', debut: '2026-12-01T14:00:00Z' },
    ]);
  });

  it('l’assignation envoie le compte et le début du créneau', () => {
    expect(corpsDAssignation(181, '2026-11-14T09:00:00Z')).toEqual({ assigned_to: 181, scheduled_at: '2026-11-14T09:00:00Z' });
  });
});

describe('etapesDeLaFrise — une étape par file', () => {
  const etats = (r: Parameters<typeof etapesDeLaFrise>[0]) => etapesDeLaFrise(r)?.map((e) => `${e.cle}:${e.etat}${e.enRetard ? '!' : ''}`);

  it('à dispatcher : Signalée est la courante', () => {
    expect(etats({ file: 'a_dispatcher', status: 'open', quote_submitted_at: null })).toEqual(['signalee:courante', 'chez_le_bailleur:a_venir', 'en_cours:a_venir', 'a_confirmer:a_venir', 'terminee:a_venir']);
  });

  it('chez le bailleur a sa propre étape', () => {
    expect(etats({ file: 'chez_le_bailleur', status: 'awaiting_owner', quote_submitted_at: '2026-11-01T10:00:00Z' })).toEqual(['signalee:faite', 'chez_le_bailleur:courante', 'en_cours:a_venir', 'a_confirmer:a_venir', 'terminee:a_venir']);
  });

  it('en cours sans devis : le bailleur est « sans objet », jamais « fait »', () => {
    expect(etats({ file: 'en_cours', status: 'assigned', quote_submitted_at: null })).toEqual(['signalee:faite', 'chez_le_bailleur:sautee', 'en_cours:courante', 'a_confirmer:a_venir', 'terminee:a_venir']);
  });

  it('en retard : l’étape En cours, marquée en retard', () => {
    expect(etats({ file: 'en_retard', status: 'assigned', quote_submitted_at: null })?.[2]).toBe('en_cours:courante!');
  });

  it('à confirmer, puis terminée (avec devis, le bailleur est fait)', () => {
    expect(etats({ file: 'a_confirmer', status: 'completed', quote_submitted_at: null })?.[3]).toBe('a_confirmer:courante');
    expect(etats({ file: 'terminees', status: 'closed', quote_submitted_at: '2026-11-01T10:00:00Z' })).toEqual(['signalee:faite', 'chez_le_bailleur:faite', 'en_cours:faite', 'a_confirmer:faite', 'terminee:faite']);
  });

  it('annulée : pas de frise', () => {
    expect(etapesDeLaFrise({ file: 'terminees', status: 'cancelled', quote_submitted_at: null })).toBeNull();
  });
});
