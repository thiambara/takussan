import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '@/types/calendar';
import { barresDeLaRangee, etatDuBien, joursEntre, lignesDOccupation, nuitsOccupees, resumeDeLOccupation } from '../occupation';

/**
 * TCK-2597 — « Occupation des biens » et les séjours en barres du mois : un séjour occupe les NUITS
 * de son arrivée à la veille de son départ ; une barre est un seul élément par rangée traversée.
 */

function sejour(id: number, arrivee: string, depart: string, o: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id, type: 'booking', title: `Séjour ${id}`, start: `${arrivee} 00:00:00`, end: `${depart} 00:00:00`, status: 'confirmed', all_day: true, property_id: 22, resource_url: `/app/bookings/${id}`, ...o };
}

const SEMAINE_DU_9 = joursEntre('2026-11-09', '2026-11-15');

describe('occupation (TCK-2597)', () => {
  it('compte les nuits, pas le jour du départ', () => {
    expect(nuitsOccupees(sejour(1, '2026-11-03', '2026-11-26'))).toEqual({ premiere: '2026-11-03', derniere: '2026-11-25' });
    expect(joursEntre('2026-11-28', '2026-12-02')).toEqual(['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
  });

  it('une barre par séjour qui traverse la rangée, bords arrondis seulement là où il commence et finit', () => {
    const { barres } = barresDeLaRangee([sejour(1, '2026-11-03', '2026-11-26'), sejour(2, '2026-11-11', '2026-11-13')], SEMAINE_DU_9);
    expect(barres).toHaveLength(2);
    expect(barres[0]).toMatchObject({ debut: 0, fin: 6, commence: false, finit: false, piste: 0 });
    expect(barres[1]).toMatchObject({ debut: 2, fin: 3, commence: true, finit: true, piste: 1 });
  });

  it('pose un séjour sur la première piste libre, et compte ce qui dépasse les pistes', () => {
    const sejours = [sejour(1, '2026-11-09', '2026-11-11'), sejour(2, '2026-11-11', '2026-11-13'), sejour(3, '2026-11-10', '2026-11-14'), sejour(4, '2026-11-12', '2026-11-15')];
    const { barres, enPlus } = barresDeLaRangee(sejours, SEMAINE_DU_9, 2);
    // 1 (9-10) et 2 (11-12) partagent la piste 0 ; 3 (10-13) prend la piste 1 ; 4 (12-14) ne tient pas.
    expect(barres.map((b) => [b.evenement.id, b.piste])).toEqual([[1, 0], [3, 1], [2, 0]]);
    expect(enPlus).toBe(1);
  });

  it('ignore ce qui n’est pas un séjour et ce qui tombe hors de la rangée', () => {
    const visite = { ...sejour(5, '2026-11-10', '2026-11-11'), type: 'visit' as const };
    expect(barresDeLaRangee([visite, sejour(6, '2026-11-01', '2026-11-09')], SEMAINE_DU_9).barres).toEqual([]);
  });

  it('dit l’état d’un bien : occupé jusqu’au départ, libre jusqu’à la prochaine arrivée, ou libre', () => {
    const [ligne] = lignesDOccupation([{ id: 22, titre: 'Villa' }], [sejour(1, '2026-11-12', '2026-11-20')]);
    expect(etatDuBien(ligne!, '2026-11-10')).toEqual({ genre: 'libreJusqua', jusqua: '2026-11-12' });
    expect(etatDuBien(ligne!, '2026-11-19')).toEqual({ genre: 'occupe', jusqua: '2026-11-20' });
    expect(etatDuBien(ligne!, '2026-11-20')).toEqual({ genre: 'libre' });
  });

  it('résume : séjours en cours ce soir, biens libres, demandes en attente à venir', () => {
    const lignes = lignesDOccupation(
      [{ id: 22, titre: 'Villa' }, { id: 31, titre: 'Studio' }, { id: 57, titre: 'F3' }],
      [
        sejour(1, '2026-11-08', '2026-11-12'),
        sejour(2, '2026-11-15', '2026-11-18', { property_id: 31, status: 'pending' }),
        sejour(3, '2026-11-01', '2026-11-05', { property_id: 57, status: 'pending' }),
      ],
    );
    expect(resumeDeLOccupation(lignes, '2026-11-10')).toEqual({ enCours: 1, libres: 2, enAttente: 1 });
  });
});
