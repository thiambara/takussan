import { describe, expect, it } from 'vitest';

import { VISIT_CLIENT_FIELDS } from '../visits';

/**
 * TCK-2587 (lot C, reprise de la vérification, C5) — « Mes visites » lit une visite du point de vue du
 * CLIENT. Ses colonnes sont épinglées : rien de ce que l'agence saisit (identité du visiteur, notes,
 * compte rendu, fiche CRM, outils de la console) n'y entre sans faire rougir ce test. L'API masque
 * déjà la plupart de ces clés au client ; la liste du front ne doit pas dépendre de ce seul rempart.
 */
const INTERDITES = [
  'visitor_name',
  'visitor_phone',
  'visitor_email',
  'notes',
  'metadata',
  'customer_id',
  'report_outcome',
  'report_objections',
  'report_note',
  'report_follow_up',
  'reported_at',
  'reported_by_id',
  'visitor_display',
  'contact_lead_id',
  'source',
  'medium',
];

describe('VISIT_CLIENT_FIELDS', () => {
  it('ne demande aucune colonne de l’agence', () => {
    expect(VISIT_CLIENT_FIELDS.filter((c) => INTERDITES.includes(c))).toEqual([]);
  });

  it('est exactement la liste revue (toute colonne neuve se décide ici)', () => {
    expect([...VISIT_CLIENT_FIELDS].sort()).toEqual(
      [
        'id',
        'property_id',
        'visitor_id',
        'agent_id',
        'type',
        'status',
        'scheduled_at',
        'preferred_window',
        'completed_at',
        'cancelled_at',
        'cancellation_reason',
        'duration_minutes',
        'rating',
        'created_at',
      ].sort(),
    );
  });
});
