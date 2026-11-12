import { describe, expect, it } from 'vitest';

import type { Task } from '@/types/pipeline';

import { lecteurDuPersonnel, nomCourt, nombreDeCorrespondances, prochaineVisite, tacheSuivante } from '../fiche-du-client';

const tache = (id: number, due_at: string | null, status: Task['status'] = 'open'): Task =>
  ({ id, title: `T${id}`, taskable_id: 1, taskable_type: 'App\\Models\\Customer', status, priority: 'medium', due_at, completed_at: null, created_at: '2026-11-01T00:00:00+00:00' }) as Task;

describe('TCK-2589 — la lecture de la fiche client', () => {
  it('le personnel se juge sur ce que l’API a rendu, pas sur un rôle', () => {
    expect(lecteurDuPersonnel({ visits_count: 0 })).toBe(true);
    expect(lecteurDuPersonnel({})).toBe(false);
  });

  it('abrège le nom du référent', () => {
    expect(nomCourt('Khady Diallo')).toBe('Khady D.');
    expect(nomCourt('  Awa  Ndiaye  Sow ')).toBe('Awa S.');
    expect(nomCourt('Mariama')).toBe('Mariama');
  });

  it('la prochaine visite dit si elle est à confirmer, par upcoming_visits', () => {
    const next_action = { type: 'visit' as const, id: 9, at: '2026-11-12T10:00:00+00:00', label: 'Studio meublé', overdue: false };
    expect(prochaineVisite({ next_action, upcoming_visits: [{ id: 9, property_id: 3, status: 'scheduled', scheduled_at: next_action.at }] })).toEqual({
      id: 9,
      at: next_action.at,
      bien: 'Studio meublé',
      aConfirmer: true,
      gere: false,
      aTranche: false,
    });
    // C2 — gérer et la tranche viennent de `upcoming_visits` (manage, preferred_window).
    expect(prochaineVisite({ next_action, upcoming_visits: [{ id: 9, property_id: 3, status: 'scheduled', scheduled_at: next_action.at, manage: true, preferred_window: 'morning' }] })).toMatchObject({ gere: true, aTranche: true });
    expect(prochaineVisite({ next_action, upcoming_visits: [{ id: 9, property_id: 3, status: 'confirmed', scheduled_at: next_action.at }] })?.aConfirmer).toBe(false);
    expect(prochaineVisite({ next_action: { ...next_action, type: 'task' } })).toBeNull();
    expect(prochaineVisite({ next_action: null })).toBeNull();
  });

  it('la tâche suivante : ouverte, par échéance, jamais la prochaine action elle-même ; rien tant que non lue', () => {
    const taches = [tache(3, '2026-11-15T09:00:00Z'), tache(1, '2026-11-13T09:00:00Z', 'done'), tache(2, '2026-11-14T09:00:00Z'), tache(4, null)];
    expect(tacheSuivante({ next_action: null }, taches)?.id).toBe(2);
    expect(tacheSuivante({ next_action: { type: 'task', id: 2, at: '', label: null, overdue: false } }, taches)?.id).toBe(3);
    expect(tacheSuivante({ next_action: null }, undefined)).toBeNull();
  });

  it('le nombre de biens correspondants vient de meta.total, jamais de la longueur de la page', () => {
    expect(nombreDeCorrespondances({ meta: { total: 37 } })).toBe(37);
    expect(nombreDeCorrespondances({ meta: {} })).toBeNull();
    expect(nombreDeCorrespondances(undefined)).toBeNull();
  });
});
