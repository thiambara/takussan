/**
 * TCK-2596 — la partie pure de « Ma journée » : la semaine de Dakar, l'échéance d'un report (09:00 à
 * Dakar), la chronologie triée, le résumé des jours, les tâches en retard.
 */
import { describe, expect, it } from 'vitest';

import type { AgentTask } from '@/types/agent-crm';
import type { CalendarEvent } from '@/types/calendar';
import type { PropertyVisit } from '@/types/visit';
import {
  chronologieDuJour,
  echeanceDuReport,
  joursDepuis,
  resumeDeLaSemaine,
  semaineDe,
  tachesDeLAgenda,
  tachesDuJour,
  tachesEnRetard,
} from '../journee';

/** Mardi 10 novembre 2026, 10:12 à Dakar (UTC+0). */
const MAINTENANT = new Date('2026-11-10T10:12:00Z');

const visite = (o: Partial<PropertyVisit> & { id: number }) => ({ status: 'confirmed', ...o }) as PropertyVisit;
const tache = (o: Partial<AgentTask> & { id: number }) => ({ title: `Tâche ${o.id}`, status: 'open', priority: 'medium', taskable: null, assignee: null, due_at: null, ...o }) as AgentTask;

describe('la semaine et les reports', () => {
  it('la semaine va du lundi au dimanche, quel que soit le jour choisi', () => {
    expect(semaineDe('2026-11-10')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(semaineDe('2026-11-15')[0]).toBe('2026-11-09');
    expect(semaineDe('2026-11-16')[0]).toBe('2026-11-16');
  });

  it('« Reporter · Demain » : le lendemain à 09:00 de Dakar ; « Lundi » : le lundi qui vient ; « Dans une semaine » : J+7', () => {
    expect(echeanceDuReport('demain', MAINTENANT)).toBe('2026-11-11T09:00:00Z');
    expect(echeanceDuReport('lundi', MAINTENANT)).toBe('2026-11-16T09:00:00Z');
    expect(echeanceDuReport('semaine', MAINTENANT)).toBe('2026-11-17T09:00:00Z');
    // Un lundi ne reporte jamais à lui-même.
    expect(echeanceDuReport('lundi', new Date('2026-11-16T08:00:00Z'))).toBe('2026-11-23T09:00:00Z');
    // 23:30 à Dakar le 10 : demain reste le 11 (le jour de Dakar, pas celui du navigateur).
    expect(echeanceDuReport('demain', new Date('2026-11-10T23:30:00Z'))).toBe('2026-11-11T09:00:00Z');
  });

  it('une demande reçue avant-hier attend depuis 2 j ; une demande d’hier soir, 1 j', () => {
    expect(joursDepuis('2026-11-08T15:00:00Z', MAINTENANT)).toBe(2);
    expect(joursDepuis('2026-11-09T22:00:00Z', MAINTENANT)).toBe(1);
  });
});

describe('la chronologie', () => {
  it('ce qui a une heure, dans l’ordre ; ni visite annulée, ni demande sans heure fixée ; à heure égale, la visite d’abord', () => {
    const moments = chronologieDuJour(
      [
        visite({ id: 2, scheduled_at: '2026-11-10T16:55:00Z' }),
        visite({ id: 1, scheduled_at: '2026-11-10T10:57:00Z' }),
        visite({ id: 3, scheduled_at: '2026-11-10T12:00:00Z', status: 'cancelled' }),
        visite({ id: 4, scheduled_at: '2026-11-10T14:00:00Z', status: 'scheduled', preferred_window: 'afternoon' }),
      ],
      [
        { id: 9, titre: 'Relancer Yacine', echeance: '2026-11-10T18:00:00Z', faite: false, cible: null },
        { id: 8, titre: 'À la même heure', echeance: '2026-11-10T16:55:00Z', faite: false, cible: null },
      ],
    );
    expect(moments.map((m) => (m.genre === 'visite' ? `v${m.visite.id}` : `t${m.tache.id}`))).toEqual(['v1', 'v2', 't8', 't9']);
  });

  it('les tâches du jour : celles échues ce jour-là à Dakar, faites comprises ; jamais une annulée', () => {
    const taches = [
      tache({ id: 1, due_at: '2026-11-10T18:00:00Z' }),
      tache({ id: 2, due_at: '2026-11-10T08:00:00Z', status: 'done' }),
      tache({ id: 3, due_at: '2026-11-09T18:00:00Z' }),
      tache({ id: 4, due_at: '2026-11-10T11:00:00Z', status: 'cancelled' }),
    ];
    expect(tachesDuJour(taches, '2026-11-10').map((t) => [t.id, t.faite])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it('les tâches d’un autre jour se lisent dans l’agenda (`/api/calendar`, heure de l’API)', () => {
    const evenements = [
      { id: 5, type: 'task', title: 'Préparer le bail', start: '2026-11-12 14:00:00', end: null, status: 'open', all_day: false, resource_url: '/app/tasks' },
      { id: 6, type: 'visit', title: 'Visite', start: '2026-11-12 10:00:00', end: null, status: 'confirmed', all_day: false, resource_url: '/app/visits/6' },
    ] as CalendarEvent[];
    expect(tachesDeLAgenda(evenements, '2026-11-12')).toEqual([{ id: 5, titre: 'Préparer le bail', echeance: '2026-11-12T14:00:00.000Z', faite: false, cible: null }]);
  });

  it('en retard : ouvertes, échues avant aujourd’hui, les plus anciennes d’abord', () => {
    const taches = [
      tache({ id: 1, due_at: '2026-10-17T09:00:00Z' }),
      tache({ id: 2, due_at: '2026-10-14T09:00:00Z' }),
      tache({ id: 3, due_at: '2026-10-10T09:00:00Z', status: 'done' }),
      tache({ id: 4, due_at: '2026-11-10T09:00:00Z' }),
    ];
    expect(tachesEnRetard(taches, MAINTENANT).map((t) => t.id)).toEqual([2, 1]);
  });
});

describe('la bande de la semaine', () => {
  it('compte les tâches de l’agenda au jour de Dakar de leur début, et ignore le reste de l’agenda', () => {
    const evenements = [
      { type: 'task', start: '2026-11-10 18:00:00' },
      { type: 'task', start: '2026-11-12 09:00:00' },
      { type: 'booking', start: '2026-11-12 00:00:00' },
      // Une visite de l'agenda ne compte pas : les visites viennent de la source de la chronologie.
      { type: 'visit', start: '2026-11-13 10:00:00' },
      { type: 'task', start: '2026-11-20 10:00:00' },
    ] as CalendarEvent[];
    const r = resumeDeLaSemaine(evenements, [], semaineDe('2026-11-10'));
    expect(r['2026-11-10']).toEqual({ visites: 0, taches: 1 });
    expect(r['2026-11-12']).toEqual({ visites: 0, taches: 1 });
    expect(r['2026-11-13']).toEqual({ visites: 0, taches: 0 });
    expect(r['2026-11-15']).toEqual({ visites: 0, taches: 0 });
  });

  it('r1 de faf3f10da — les visites se comptent par la règle de la chronologie : faite et manquée comptent, annulée et tranche non', () => {
    const visites = [
      visite({ id: 1, scheduled_at: '2026-11-10T10:57:00Z' }),
      visite({ id: 2, scheduled_at: '2026-11-10T16:55:00Z', status: 'scheduled' }),
      // Le 11 : la visite faite que l'agenda taisait (la bande disait « Libre »).
      visite({ id: 3, scheduled_at: '2026-11-11T11:00:00Z', status: 'completed' }),
      visite({ id: 4, scheduled_at: '2026-11-12T09:00:00Z', status: 'no_show' }),
      visite({ id: 5, scheduled_at: '2026-11-13T09:00:00Z', status: 'cancelled' }),
      visite({ id: 6, scheduled_at: '2026-11-14T09:00:00Z', status: 'scheduled', preferred_window: 'morning' }),
      visite({ id: 7, scheduled_at: '2026-11-16T09:00:00Z' }),
    ];
    const r = resumeDeLaSemaine([], visites, semaineDe('2026-11-10'));
    expect(r['2026-11-10']!.visites).toBe(2);
    expect(r['2026-11-11']!.visites).toBe(1);
    expect(r['2026-11-12']!.visites).toBe(1);
    expect(r['2026-11-13']!.visites).toBe(0);
    expect(r['2026-11-14']!.visites).toBe(0);
    // Chaque jour, la bande dit ce que la chronologie montre.
    for (const jour of semaineDe('2026-11-10')) {
      const duJour = visites.filter((v) => v.scheduled_at!.startsWith(jour));
      expect(r[jour]!.visites).toBe(chronologieDuJour(duJour, []).length);
    }
  });
});
