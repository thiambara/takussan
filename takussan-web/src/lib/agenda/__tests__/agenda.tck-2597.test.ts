/**
 * TCK-2597 — la partie pure de l'agenda : vues et types d'ouverture selon la personne, journée (temps
 * libre, séjours repliés), semaine (heures de Dakar, chevauchements, plage élargie).
 */
import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '@/types/calendar';
import {
  basculerType,
  journeeDeLAgenda,
  minutesADakar,
  modesDisponibles,
  occupationDuJour,
  resumeDeLaPeriode,
  semaineDeLAgenda,
  typesDeLUrl,
  typesParDefaut,
  vueParDefaut,
} from '../agenda';

let n = 0;
function evt(type: CalendarEvent['type'], start: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  n += 1;
  return { id: n, type, title: `E${n}`, start, end: extra.end ?? start, status: 'confirmed', all_day: false, resource_url: '/x', ...extra };
}

describe('agenda — ouverture selon la personne', () => {
  it('l’agent ouvre sa journée au téléphone, sa semaine au bureau ; les autres, le mois', () => {
    expect(vueParDefaut('agent', false)).toBe('day');
    expect(vueParDefaut('agent', true)).toBe('week');
    expect(vueParDefaut('admin', true)).toBe('month');
    expect(vueParDefaut('admin', false)).toBe('month');
    expect(vueParDefaut('bailleur', true)).toBe('month');
  });

  it('« Mon agenda » de l’agent ne demande pas les séjours ; l’occupation les demande', () => {
    expect(typesParDefaut('agent', 'agenda')).toEqual(['visit', 'task']);
    expect(typesParDefaut('agent', 'occupation')).toEqual(['booking', 'lease_event', 'maintenance']);
    // L'admin et le bailleur gardent les cinq types : les séjours y sont repliés en fin de journée.
    expect(typesParDefaut('bailleur', 'agenda')).toEqual(['booking', 'visit', 'task', 'lease_event', 'maintenance']);
    expect(typesParDefaut('prestataire', 'agenda')).toEqual(['maintenance']);
    expect(modesDisponibles('prestataire')).toEqual(['agenda']);
  });

  it('lit les types de l’URL dans le mode, et rend le défaut sans eux', () => {
    expect(typesDeLUrl('task,bidon', 'agent', 'agenda')).toEqual(['task']);
    expect(typesDeLUrl('visit', 'agent', 'occupation')).toEqual(['booking', 'lease_event', 'maintenance']);
    expect(typesDeLUrl(null, 'admin', 'agenda')).toHaveLength(5);
  });

  it('bascule un type sans jamais tout éteindre, et n’écrit pas le défaut', () => {
    expect(basculerType(['visit'], 'visit', 'agent', 'agenda')).toBeUndefined();
    expect(basculerType(['visit', 'task'], 'booking', 'agent', 'agenda')).toBe('booking,visit,task');
    expect(basculerType(['visit'], 'task', 'agent', 'agenda')).toBeNull();
  });
});

describe('agenda — la journée', () => {
  it('met les séjours à part, le temps libre d’au moins une heure entre deux rendez-vous', () => {
    const v1 = evt('visit', '2026-11-10 10:57:41', { end: '2026-11-10 11:27:41' });
    const v2 = evt('visit', '2026-11-10 16:55:28', { end: '2026-11-10 17:25:28' });
    const t1 = evt('task', '2026-11-10 17:30:00');
    const sejour = evt('booking', '2026-11-02 00:00:00', { end: '2026-11-24 00:00:00', all_day: true });
    const echeance = evt('lease_event', '2026-11-10 00:00:00', { all_day: true });
    const j = journeeDeLAgenda([t1, sejour, v2, v1, echeance], '2026-11-10');

    expect(j.sejours).toEqual([sejour]);
    expect(j.sansHeure).toEqual([echeance]);
    expect(j.lignes.map((l) => (l.genre === 'libre' ? `libre ${l.libre.de}-${l.libre.a}` : l.m.evenement.id))).toEqual([
      v1.id,
      `libre ${11 * 60 + 30}-${16 * 60 + 55}`,
      v2.id,
      t1.id,
    ]);
  });

  it('lit l’heure à Dakar, jamais dans le fuseau du navigateur', () => {
    expect(minutesADakar('2026-11-10 10:57:41')).toBe(10 * 60 + 57);
  });

  it('compte les séjours en cours ce soir, les arrivées et les départs', () => {
    const s = [
      evt('booking', '2026-11-02 00:00:00', { end: '2026-11-24 00:00:00', all_day: true }),
      evt('booking', '2026-11-10 00:00:00', { end: '2026-11-13 00:00:00', all_day: true }),
      evt('booking', '2026-11-06 00:00:00', { end: '2026-11-10 00:00:00', all_day: true }),
    ];
    expect(occupationDuJour(s, '2026-11-10')).toEqual({ enCours: 2, arrivees: 1, departs: 1 });
  });
});

describe('agenda — la semaine', () => {
  it('pose les blocs au jour de Dakar, partage la largeur de ceux qui se chevauchent', () => {
    const a = evt('visit', '2026-11-16 09:35:48', { end: '2026-11-16 10:20:48' });
    const b = evt('visit', '2026-11-16 09:36:32', { end: '2026-11-16 10:21:32' });
    const c = evt('visit', '2026-11-16 09:39:32', { end: '2026-11-16 10:24:32' });
    const d = evt('visit', '2026-11-16 14:51:10', { end: '2026-11-16 15:36:10' });
    const s = semaineDeLAgenda([a, b, c, d], '2026-11-18');
    expect(s.jours[0]).toBe('2026-11-16');
    const pistes = Object.fromEntries(s.blocs.map((x) => [x.evenement.id, `${x.piste}/${x.pistes}`]));
    expect(pistes).toEqual({ [a.id]: '0/3', [b.id]: '1/3', [c.id]: '2/3', [d.id]: '0/1' });
  });

  it('élargit la plage à ce qui sort de 8 h – 20 h, plutôt que de le perdre', () => {
    const tot = evt('maintenance', '2026-11-13 06:41:03');
    const tard = evt('maintenance', '2026-11-13 20:56:48');
    const s = semaineDeLAgenda([tot, tard], '2026-11-13');
    expect([s.de, s.a]).toEqual([6, 22]);
    expect(s.blocs).toHaveLength(2);
  });

  it('met les journées entières (tranche, échéance) et les séjours dans « Sans heure »', () => {
    const tranche = evt('visit', '2026-11-12 00:00:00', { all_day: true, kind: null });
    const sejour = evt('booking', '2026-11-11 00:00:00', { end: '2026-11-13 00:00:00', all_day: true });
    const s = semaineDeLAgenda([tranche, sejour], '2026-11-12');
    expect(s.sansHeure['2026-11-12']).toEqual([tranche, sejour]);
    expect(s.sansHeure['2026-11-11']).toEqual([sejour]);
    expect(s.blocs).toHaveLength(0);
  });

  it('résume la période : visites, dont à confirmer, et tâches', () => {
    expect(resumeDeLaPeriode([evt('visit', '2026-11-10 10:00:00', { status: 'scheduled' }), evt('visit', '2026-11-10 11:00:00'), evt('task', '2026-11-10 12:00:00')])).toEqual({
      visites: 2,
      aConfirmer: 1,
      taches: 1,
    });
  });
});
