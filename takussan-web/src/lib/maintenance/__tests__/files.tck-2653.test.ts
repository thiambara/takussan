/**
 * TCK-2653 — les files d'interventions de l'agence, sans rendu : l'attente écrite sur chaque carte,
 * le geste de chaque file, et les paramètres des lectures (champs épinglés, `filter[file]`, résumé).
 */
import { describe, expect, it } from 'vitest';

import {
  attenteDe,
  CHAMPS_D_UNE_CARTE,
  dureeDepuis,
  enAttenteDUnGeste,
  FILES_DE_L_AGENCE,
  gestesDeLaCarte,
  joursAvant,
  type InterventionEnFile,
} from '@/lib/maintenance/files';
import { nomDuCarnet, parametresDuResume, parametresDUneFile } from '@/lib/queries/maintenance-files';

const MAINTENANT = new Date('2026-11-10T12:00:00Z');
const ilYA = (ms: number) => new Date(MAINTENANT.getTime() - ms).toISOString();
const J = 86_400_000;

function demande(extra: Partial<InterventionEnFile>): InterventionEnFile {
  return {
    id: 8,
    property_id: 78,
    lease_id: null,
    requester_id: 10,
    assigned_to: null,
    title: 'Nettoyage de la cage d’escalier',
    description: '',
    category: 'cleaning',
    priority: 'normal',
    status: 'open',
    estimated_cost: null,
    actual_cost: null,
    quote_amount: null,
    quote_currency: null,
    quote_submitted_at: null,
    quote_decision_at: null,
    quote_decision_by_id: null,
    quote_rejection_reason: null,
    scheduled_at: null,
    started_at: null,
    completed_at: null,
    resolution_notes: null,
    created_at: ilYA(57 * J),
    ...extra,
  };
}

describe('dureeDepuis', () => {
  it('se lit en minutes, puis en heures, puis en jours', () => {
    expect(dureeDepuis(ilYA(30_000), MAINTENANT)).toEqual({ n: 1, unite: 'minute' });
    expect(dureeDepuis(ilYA(25 * 60_000), MAINTENANT)).toEqual({ n: 25, unite: 'minute' });
    expect(dureeDepuis(ilYA(2 * 3_600_000 + 10), MAINTENANT)).toEqual({ n: 2, unite: 'hour' });
    expect(dureeDepuis(ilYA(57 * J + 3_600_000), MAINTENANT)).toEqual({ n: 57, unite: 'day' });
  });

  it('rend null sans date lisible', () => {
    expect(dureeDepuis(null, MAINTENANT)).toBeNull();
    expect(dureeDepuis('pas une date', MAINTENANT)).toBeNull();
  });
});

describe('joursAvant', () => {
  it('arrondit au jour supérieur et ne descend pas sous zéro', () => {
    expect(joursAvant(new Date(MAINTENANT.getTime() + 5.2 * J).toISOString(), MAINTENANT)).toBe(6);
    expect(joursAvant(ilYA(J), MAINTENANT)).toBe(0);
    expect(joursAvant(null, MAINTENANT)).toBeNull();
  });
});

describe('attenteDe — ce que la carte écrit, selon sa file', () => {
  it('à dispatcher : « Ouverte depuis », en ambre au-delà de trois jours', () => {
    expect(attenteDe(demande({ file: 'a_dispatcher', waiting_since: ilYA(57 * J) }), MAINTENANT)).toEqual({ cle: 'ouverte', duree: { n: 57, unite: 'day' }, ton: 'ambre' });
    expect(attenteDe(demande({ file: 'a_dispatcher', waiting_since: ilYA(3 * J) }), MAINTENANT)).toMatchObject({ cle: 'ouverte', ton: 'neutre' });
    expect(attenteDe(demande({ file: 'a_dispatcher', waiting_since: ilYA(2 * 3_600_000) }), MAINTENANT)).toMatchObject({ duree: { n: 2, unite: 'hour' }, ton: 'neutre' });
  });

  it('à dispatcher : l’entrée dans la file prime sur la création', () => {
    const a = attenteDe(demande({ file: 'a_dispatcher', created_at: ilYA(57 * J), waiting_since: ilYA(J) }), MAINTENANT);
    expect(a).toMatchObject({ duree: { n: 1, unite: 'day' } });
  });

  it('en retard : le créneau dépassé, toujours en rouge', () => {
    const creneau = ilYA(15 * J);
    expect(attenteDe(demande({ file: 'en_retard', scheduled_at: creneau, slot_overdue_days: 15 }), MAINTENANT)).toEqual({ cle: 'creneauDepasse', creneau, jours: 15, ton: 'rouge' });
  });

  it('chez le bailleur : depuis quand, en ambre au-delà de trois jours', () => {
    expect(attenteDe(demande({ file: 'chez_le_bailleur', status: 'awaiting_owner', waiting_since: ilYA(4 * J) }), MAINTENANT)).toMatchObject({ cle: 'chezLeBailleur', ton: 'ambre' });
  });

  it('en cours : un devis à décider, un devis demandé, le créneau, ou depuis quand elle est confiée', () => {
    expect(attenteDe(demande({ file: 'en_cours', status: 'quote_submitted', waiting_since: ilYA(5 * J) }), MAINTENANT)).toMatchObject({ cle: 'devisADecider', ton: 'ambre' });
    expect(attenteDe(demande({ file: 'en_cours', status: 'quote_requested', waiting_since: ilYA(5 * J) }), MAINTENANT)).toMatchObject({ cle: 'devisDemande', ton: 'neutre' });
    const demain = new Date(MAINTENANT.getTime() + J).toISOString();
    expect(attenteDe(demande({ file: 'en_cours', status: 'assigned', assigned_to: 3, scheduled_at: demain }), MAINTENANT)).toEqual({ cle: 'creneau', creneau: demain, ton: 'neutre' });
    expect(attenteDe(demande({ file: 'en_cours', status: 'in_progress', assigned_to: 3, waiting_since: ilYA(2 * J) }), MAINTENANT)).toMatchObject({ cle: 'confiee' });
  });

  it('à confirmer : la date de fin et les jours avant la clôture automatique', () => {
    const fin = ilYA(J);
    const cloture = new Date(MAINTENANT.getTime() + 6 * J).toISOString();
    expect(attenteDe(demande({ file: 'a_confirmer', status: 'completed', completed_at: fin, auto_close_at: cloture }), MAINTENANT)).toEqual({ cle: 'aConfirmer', terminee: fin, jours: 6, ton: 'neutre' });
  });

  it('rien pour une ligne sans sa file (champs non lus) ni pour une terminée', () => {
    expect(attenteDe(demande({ file: null }), MAINTENANT)).toBeNull();
    expect(attenteDe(demande({ file: 'terminees', status: 'closed' }), MAINTENANT)).toBeNull();
  });
});

describe('gestesDeLaCarte — un geste par file', () => {
  it('à dispatcher : « Choisir un prestataire », et lui seul', () => {
    expect(gestesDeLaCarte({ file: 'a_dispatcher', status: 'open' })).toEqual(['choisir']);
  });
  it('en retard : relancer et réassigner', () => {
    expect(gestesDeLaCarte({ file: 'en_retard', status: 'assigned' })).toEqual(['relancer', 'reassigner']);
  });
  it('chez le bailleur : relancer le bailleur (TCK-2786) et voir le devis ; un devis qui attend l’agence : voir le devis', () => {
    expect(gestesDeLaCarte({ file: 'chez_le_bailleur', status: 'awaiting_owner' })).toEqual(['relancerBailleur', 'voirDevis']);
    expect(gestesDeLaCarte({ file: 'en_cours', status: 'quote_submitted' })).toEqual(['voirDevis']);
  });
  it('en cours ailleurs, à confirmer et terminées : aucun', () => {
    expect(gestesDeLaCarte({ file: 'en_cours', status: 'in_progress' })).toEqual([]);
    expect(gestesDeLaCarte({ file: 'a_confirmer', status: 'completed' })).toEqual([]);
    expect(gestesDeLaCarte({ file: 'terminees', status: 'closed' })).toEqual([]);
  });
});

describe('les lectures', () => {
  it('les champs d’une carte portent les trois colonnes sans lesquelles l’API ne rend pas la file', () => {
    for (const c of ['status', 'assigned_to', 'scheduled_at', 'queue_entered_at', 'completed_at', 'created_at'] as const) {
      expect(CHAMPS_D_UNE_CARTE).toContain(c);
    }
  });

  it('une file : `filter[file]`, les filtres communs, ses champs et ses inclusions', () => {
    const p = parametresDUneFile('en_retard', { priority: 'urgent', category: 'plumbing', propertyId: 4, search: 'fuite' }, 10);
    expect(p.filter).toEqual({ file: 'en_retard', priority: 'urgent', category: 'plumbing', property_id: 4, search: 'fuite' });
    expect(p.include).toEqual(['property', 'requester', 'assignee']);
    expect(p.fields?.maintenance_requests).toEqual([...CHAMPS_D_UNE_CARTE]);
    expect(p.per_page).toBe(10);
    // Le tri est explicite : celui de l'API par défaut range la priorité en texte (normal > low > high).
    expect(p.sort).toBe('-priority,created_at');
  });

  it('le résumé : les filtres seuls, jamais `filter[file]`', () => {
    expect(parametresDuResume({})).toEqual({});
    expect(parametresDuResume({ priority: 'high' })).toEqual({ filter: { priority: 'high' } });
  });

  it('« en attente d’un geste » somme les cinq files de l’agence, sans les terminées', () => {
    expect(FILES_DE_L_AGENCE).toEqual(['a_dispatcher', 'en_retard', 'chez_le_bailleur', 'en_cours', 'a_confirmer']);
    expect(enAttenteDUnGeste({ a_dispatcher: 3, en_retard: 1, chez_le_bailleur: 1, en_cours: 4, a_confirmer: 2, terminees: 38, a_accepter: 5 })).toBe(11);
  });
});

describe('nomDuCarnet — le nom d’un prestataire du carnet', () => {
  it('prend le nom du compte, sinon celui de l’invitation, sinon l’e-mail, sinon l’identifiant', () => {
    const user = { id: 9, first_name: 'Awa', last_name: 'Diop', email: 'awa@example.net' };
    expect(nomDuCarnet({ user, metadata: { first_name: 'Autre' }, user_id: 9 })).toBe('Awa Diop');
    expect(nomDuCarnet({ user: { ...user, first_name: ' ', last_name: null }, metadata: { first_name: 'Modou', last_name: 'Fall' }, user_id: 9 })).toBe('Modou Fall');
    expect(nomDuCarnet({ user: { ...user, first_name: null, last_name: null }, metadata: null, user_id: 9 })).toBe('awa@example.net');
    expect(nomDuCarnet({ user: { ...user, first_name: null, last_name: null, email: '' }, metadata: { email: '' }, user_id: 9 })).toBe('9');
  });
});
