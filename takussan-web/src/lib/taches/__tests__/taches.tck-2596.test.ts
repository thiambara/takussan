/**
 * TCK-2596 (lot 2) — la page « Tâches », partie pure : le contrat de l'URL (TCK-591, TCK-1733), les
 * pastilles, les groupes par échéance au jour de Dakar, l'échéance d'une tâche neuve, le balayage.
 */
import { describe, expect, it } from 'vitest';

import {
  basculer,
  echeanceDeLaDate,
  echeanceDuChoix,
  filtreDeLaListe,
  filtreDuCompte,
  groupeDe,
  issueDuBalayage,
  lireEtat,
  rechercheDe,
  type EtatDesTaches,
} from '../taches';

/** Mardi 10 novembre 2026, 10:12 à Dakar (UTC+0). */
const MAINTENANT = new Date('2026-11-10T10:12:00Z');

describe('l’URL de « Tâches »', () => {
  it('sans échéance, s’ouvre sur En retard + Aujourd’hui ; l’URL reste nue', () => {
    const etat = lireEtat({});
    expect(etat.selection).toEqual({ mode: 'periodes', periodes: ['overdue', 'today'] });
    expect(filtreDeLaListe(etat)).toEqual({ due: 'overdue,today' });
    expect(rechercheDe(etat)).toBe('');
  });

  it('la tuile « Tâches du jour » ouvre comme avant, portée comprise, et se réécrit à l’identique', () => {
    const etat = lireEtat({ 'filter[due]': 'today', 'filter[assigned_to]': 'me' });
    expect(etat.selection).toEqual({ mode: 'periodes', periodes: ['today'] });
    expect(filtreDeLaListe(etat)).toEqual({ assigned_to: 'me', due: 'today' });
    expect(rechercheDe(etat)).toBe('filter[due]=today&filter[assigned_to]=me');
  });

  it('« Toutes », « Faites », une liste ; une valeur inconnue ou une autre portée sont ignorées', () => {
    expect(lireEtat({ 'filter[due]': 'all' }).selection).toEqual({ mode: 'toutes' });
    expect(filtreDeLaListe(lireEtat({ 'filter[due]': 'all' }))).toEqual({});
    expect(lireEtat({ 'filter[status]': 'done' }).selection).toEqual({ mode: 'faites' });
    expect(filtreDeLaListe(lireEtat({ 'filter[status]': 'done' }))).toEqual({ status: 'done' });
    expect(lireEtat({ 'filter[due]': 'none,upcoming,x' }).selection).toEqual({ mode: 'periodes', periodes: ['upcoming', 'none'] });
    expect(lireEtat({ 'filter[due]': 'x' }).selection).toEqual({ mode: 'periodes', periodes: ['overdue', 'today'] });
    expect(lireEtat({ 'filter[assigned_to]': '42' }).aMoi).toBe(false);
  });

  it('changer d’échéance garde « assignées à moi » dans l’URL', () => {
    const etat = lireEtat({ 'filter[assigned_to]': 'me' });
    const suivant: EtatDesTaches = { ...etat, selection: basculer(etat.selection, 'upcoming') };
    expect(rechercheDe(suivant)).toBe('filter[due]=overdue,today,upcoming&filter[assigned_to]=me');
    expect(rechercheDe({ ...etat, selection: basculer(etat.selection, 'done') })).toBe('filter[status]=done&filter[assigned_to]=me');
  });

  it('la vue d’équipe porte filter[team] et l’agent isolé', () => {
    const etat = lireEtat({ 'filter[team]': '1', 'filter[assigned_to_id]': '12' });
    expect(filtreDeLaListe(etat)).toEqual({ team: '1', assigned_to_id: '12', due: 'overdue,today' });
    expect(rechercheDe(etat)).toBe('filter[team]=1&filter[assigned_to_id]=12');
  });
});

describe('les pastilles', () => {
  it('une échéance s’ajoute ou se retire ; la dernière retirée rend « Toutes »', () => {
    const ouverture = lireEtat({}).selection;
    expect(basculer(ouverture, 'today')).toEqual({ mode: 'periodes', periodes: ['overdue'] });
    expect(basculer(basculer(ouverture, 'today'), 'overdue')).toEqual({ mode: 'toutes' });
    expect(basculer({ mode: 'faites' }, 'none')).toEqual({ mode: 'periodes', periodes: ['none'] });
    expect(basculer({ mode: 'faites' }, 'done')).toEqual(ouverture);
  });

  it('chaque compte dit ce qui reste à faire, sauf « Faites »', () => {
    const etat = lireEtat({ 'filter[assigned_to]': 'me' });
    expect(filtreDuCompte(etat, 'today')).toEqual({ assigned_to: 'me', due: 'today', status: 'open,in_progress' });
    expect(filtreDuCompte(etat, 'done')).toEqual({ assigned_to: 'me', status: 'done' });
  });
});

describe('les groupes, au jour de Dakar', () => {
  const t = (due_at: string | null, status: 'open' | 'done' = 'open') => groupeDe({ due_at, status }, MAINTENANT);
  it('en retard, aujourd’hui (faite ou non), cette semaine (jusqu’au dimanche), plus tard, sans échéance', () => {
    expect(t('2026-10-17T09:00:00Z')).toBe('retard');
    expect(t('2026-10-17T09:00:00Z', 'done')).toBe('faites');
    expect(t('2026-11-10T00:00:00Z')).toBe('aujourdhui');
    expect(t('2026-11-10T23:59:00Z', 'done')).toBe('aujourdhui');
    expect(t('2026-11-15T20:00:00Z')).toBe('semaine');
    expect(t('2026-11-16T09:00:00Z')).toBe('plusTard');
    expect(t(null)).toBe('sans');
  });
});

describe('l’échéance d’une tâche neuve', () => {
  it('sans heure, 09:00 à Dakar ; « Lundi » est le lundi qui vient ; avec une heure, celle-ci', () => {
    expect(echeanceDuChoix('demain', null, MAINTENANT)).toBe('2026-11-11T09:00:00Z');
    expect(echeanceDuChoix('lundi', null, MAINTENANT)).toBe('2026-11-16T09:00:00Z');
    expect(echeanceDuChoix('aujourdhui', '14:30', MAINTENANT)).toBe('2026-11-10T14:30:00Z');
    expect(echeanceDuChoix('demain', '18:00', MAINTENANT)).toBe('2026-11-11T18:00:00Z');
  });

  it('une date du calendrier se lit à Dakar ; une saisie incomplète ne donne rien', () => {
    expect(echeanceDeLaDate('2026-11-20T15:00')).toBe('2026-11-20T15:00:00Z');
    expect(echeanceDeLaDate('2026-11-20')).toBe('2026-11-20T09:00:00Z');
    expect(echeanceDeLaDate('')).toBeNull();
  });
});

describe('le balayage', () => {
  it('à droite au-delà du seuil : fait ; à gauche : reporter ; en deçà : rien', () => {
    expect(issueDuBalayage(100, 390)).toBe('fait');
    expect(issueDuBalayage(-100, 390)).toBe('reporter');
    expect(issueDuBalayage(60, 390)).toBeNull();
    // Sur une ligne étroite, le seuil est le tiers de la ligne, jamais moins de 48 px.
    expect(issueDuBalayage(50, 150)).toBe('fait');
    expect(issueDuBalayage(40, 90)).toBeNull();
  });
});
