import { describe, expect, it } from 'vitest';

import { reboursDuProchain } from '../agenda';
import type { CalendarEvent } from '@/types/calendar';

/**
 * TCK-2888 — « dans N min » : seulement pour un événement du jour, à venir, dans les deux heures ;
 * au-delà, l'heure seule. Les débuts de l'API sont en UTC sans suffixe ; Dakar est à UTC+0.
 */
function evenement(o: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id: 1, type: 'visit', title: 'Local', start: '2026-11-10 10:57:00', end: '2026-11-10 11:27:00', status: 'confirmed', all_day: false, resource_url: '/app/visits/1', ...o };
}
const a = (iso: string) => new Date(iso);

describe('reboursDuProchain (TCK-2888)', () => {
  it('à H−45, « 45 min » sur le prochain événement', () => {
    expect(reboursDuProchain([evenement()], '2026-11-10', a('2026-11-10T10:12:00Z'))).toMatchObject({ evenement: { id: 1 }, heures: 0, minutes: 45 });
  });

  it('à H−3 h, rien : l’heure seule', () => {
    expect(reboursDuProchain([evenement()], '2026-11-10', a('2026-11-10T07:57:00Z'))).toBeNull();
  });

  it('à deux heures pile, encore ; à deux heures et une minute, plus', () => {
    expect(reboursDuProchain([evenement()], '2026-11-10', a('2026-11-10T08:57:00Z'))).toMatchObject({ heures: 2, minutes: 0 });
    expect(reboursDuProchain([evenement()], '2026-11-10', a('2026-11-10T08:56:00Z'))).toBeNull();
  });

  it('le PROCHAIN : ni un événement passé, ni un plus lointain, ni un séjour, ni une journée entière', () => {
    const passe = evenement({ id: 2, start: '2026-11-10 09:00:00' });
    const loin = evenement({ id: 3, start: '2026-11-10 11:30:00' });
    const sejour = evenement({ id: 4, type: 'booking', start: '2026-11-10 10:20:00', all_day: true });
    const journee = evenement({ id: 5, type: 'task', start: '2026-11-10 00:00:00', all_day: true });
    expect(reboursDuProchain([loin, sejour, journee, passe, evenement()], '2026-11-10', a('2026-11-10T10:12:00Z'))?.evenement.id).toBe(1);
  });

  it('un autre jour que celui de maintenant : rien', () => {
    expect(reboursDuProchain([evenement({ start: '2026-11-11 00:30:00' })], '2026-11-11', a('2026-11-10T23:50:00Z'))).toBeNull();
  });
});
