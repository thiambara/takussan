import { describe, expect, it } from 'vitest';

import type { InterventionEnFile } from '@/lib/maintenance/files';
import {
  aPercevoir,
  CHAMPS_DES_INTERVENTIONS_DU_PRESTATAIRE,
  genreDuCreneau,
  grilleDeLaSemaine,
  semaineDe,
  tourneeDeLaSemaine,
} from '../semaine-du-prestataire';

const MARDI_10 = new Date('2026-11-10T09:30:00Z'); // Dakar = UTC+0
const semaine = semaineDe(MARDI_10);

function i(id: number, scheduled_at: string | null, autres: Partial<InterventionEnFile> = {}): InterventionEnFile {
  return { id, title: `#${id}`, status: 'assigned', accepted_at: '2026-11-01T00:00:00Z', file: 'en_cours', scheduled_at, ...autres } as InterventionEnFile;
}

describe('semaine du prestataire — TCK-2654, lot 4', () => {
  it('la semaine va du lundi au dimanche à Dakar, bornes de filter[scheduled_from|to]', () => {
    expect(semaine.aujourdhui).toBe('2026-11-10');
    expect(semaine.jours).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    // Un dimanche soir appartient à la semaine qui finit, pas à la suivante.
    expect(semaineDe(new Date('2026-11-15T23:30:00Z')).jours[0]).toBe('2026-11-09');
    expect(semaineDe(new Date('2026-11-16T00:10:00Z')).jours[0]).toBe('2026-11-16');
  });

  it('les colonnes lues portent l’acceptation et celles d’une carte de file', () => {
    for (const c of ['accepted_at', 'status', 'assigned_to', 'scheduled_at']) expect(CHAMPS_DES_INTERVENTIONS_DU_PRESTATAIRE).toContain(c);
  });

  it('un créneau est « à accepter » tant qu’il n’est pas accepté, « fait » une fois rendu', () => {
    expect(genreDuCreneau({ status: 'assigned', accepted_at: null, file: 'a_accepter' })).toBe('attente');
    expect(genreDuCreneau({ status: 'assigned', accepted_at: '2026-11-01T00:00:00Z', file: 'en_cours' })).toBe('prevu');
    expect(genreDuCreneau({ status: 'completed', accepted_at: '2026-11-01T00:00:00Z', file: 'a_confirmer' })).toBe('fait');
    expect(genreDuCreneau({ status: 'closed', accepted_at: null, file: 'terminees' })).toBe('fait');
  });

  it('la grille : lundi → samedi, le dimanche seulement s’il porte un créneau ; 8 h → 17 h, élargie au besoin', () => {
    const g = grilleDeLaSemaine([i(1, '2026-11-12T09:00:00Z'), i(2, null), i(3, '2026-11-20T09:00:00Z')], semaine);
    expect(g.jours).toHaveLength(6);
    expect(g.heures[0]).toBe(8);
    expect(g.heures.at(-1)).toBe(17);
    expect(g.creneaux.map((c) => [c.intervention.id, c.jour, c.de])).toEqual([[1, '2026-11-12', 9]]);

    const tot = grilleDeLaSemaine([i(4, '2026-11-15T19:30:00Z'), i(5, '2026-11-09T06:15:00Z')], semaine);
    expect(tot.jours).toHaveLength(7);
    expect(tot.heures[0]).toBe(6);
    expect(tot.heures.at(-1)).toBe(19);
    expect(tot.creneaux.find((c) => c.intervention.id === 4)?.de).toBe(19.5);
  });

  it('« Cette semaine » : les passages acceptés d’aujourd’hui à la fin de semaine, par jour ; puis les jours sans rien', () => {
    const t = tourneeDeLaSemaine(
      [
        i(1, '2026-11-12T14:00:00Z'),
        i(2, '2026-11-12T09:00:00Z'),
        i(3, '2026-11-11T09:00:00Z', { accepted_at: null, file: 'a_accepter' }), // à accepter : sa carte est au-dessus
        i(4, '2026-11-09T15:00:00Z'), // hier
        i(5, '2026-11-10T08:00:00Z', { status: 'completed', file: 'a_confirmer' }), // rendue ce matin
        i(6, '2026-11-10T07:00:00Z'), // ce matin, pas encore rendue : elle reste
      ],
      semaine,
    );
    expect(t.jours.map((j) => [j.jour, j.interventions.map((x) => x.id)])).toEqual([
      ['2026-11-10', [6]],
      ['2026-11-12', [2, 1]],
    ]);
    expect(t.sansRien).toEqual(['2026-11-13', '2026-11-14']);
    expect(tourneeDeLaSemaine([], semaine).sansRien).toEqual(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
  });

  it('« À percevoir » : à valider et validées seulement ; aucun total quand l’API en compte plus qu’elle n’en rend', () => {
    const lues = [
      { amount: 283981, status: 'pending_validation' as const },
      { amount: 268035, status: 'validated' as const },
      { amount: 46500, status: 'paid' as const },
      { amount: 10000, status: 'rejected' as const },
      { amount: 20000, status: 'cancelled' as const },
    ];
    expect(aPercevoir(lues, lues.length)).toBe(552016);
    expect(aPercevoir(lues.slice(0, 2), 101)).toBeNull();
    expect(aPercevoir([], 0)).toBe(0);
  });
});
