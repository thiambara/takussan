import { describe, expect, it } from 'vitest';

import { anciennete, etatDeLAgent, etatDeLaRequete, etatDuBloc, titreEtQuartier, tranchesNonVides, type AgentDuJour } from '../a-faire';

/** TCK-2624 — la partie pure de « À faire maintenant ». */
describe('etatDuBloc — « Tout est à jour » ne se dit que si CHAQUE file a répondu à zéro', () => {
  const pret = (total: number) => ({ etat: 'pret', total }) as const;
  it('une file non vide suffit à rendre des lignes, même si une autre charge ou a échoué', () => {
    expect(etatDuBloc([pret(0), pret(2), { etat: 'chargement' }, { etat: 'echec' }])).toBe('lignes');
  });
  it('une file en chargement n’est pas une file vide', () => {
    expect(etatDuBloc([pret(0), { etat: 'chargement' }])).toBe('chargement');
  });
  it('une file en panne n’est pas une file vide', () => {
    expect(etatDuBloc([pret(0), { etat: 'echec' }])).toBe('echec');
  });
  it('toutes à zéro : à jour', () => {
    expect(etatDuBloc([pret(0), pret(0)])).toBe('aJour');
  });
});

describe('etatDeLaRequete', () => {
  it('une relecture ratée garde l’ancienne réponse : la file reste lisible', () => {
    expect(etatDeLaRequete({ isPending: false, isError: true, data: { n: 3 } }, (d) => d.n)).toEqual({ etat: 'pret', total: 3 });
    expect(etatDeLaRequete({ isPending: false, isError: true }, () => 0)).toEqual({ etat: 'echec' });
    expect(etatDeLaRequete({ isPending: true, isError: false }, () => 0)).toEqual({ etat: 'chargement' });
  });
});

describe('anciennete', () => {
  const maintenant = new Date('2026-11-10T10:12:00Z');
  it.each([
    ['2026-11-10T10:12:00Z', { unite: 'min', n: 1 }],
    ['2026-11-10T09:30:00Z', { unite: 'min', n: 42 }],
    ['2026-11-10T08:12:00Z', { unite: 'h', n: 2 }],
    ['2026-11-09T09:00:00Z', { unite: 'hier' }],
    ['2026-11-07T10:12:00Z', { unite: 'j', n: 3 }],
  ])('%s → %o', (depuis, attendu) => {
    expect(anciennete(depuis, maintenant)).toEqual(attendu);
  });
});

it('tranchesNonVides — les tranches dans l’ordre de l’âge, une tranche vide se tait', () => {
  const c = (count: number) => ({ count, amount: 0 });
  expect(tranchesNonVides({ buckets: { '1_30': c(9), '31_60': c(3), '61_90': c(0), '90_plus': c(4) } })).toEqual([
    { cle: '1_30', n: 9 },
    { cle: '31_60', n: 3 },
    { cle: '90_plus', n: 4 },
  ]);
});

it('etatDeLAgent — l’absence d’abord, puis la première visite, sinon rien (pas de « Au bureau » inventé)', () => {
  const a = (o: Partial<AgentDuJour>): AgentDuJour => ({ user_id: 1, name: 'A', avatar_url: null, visits_today_count: 0, first_visit_at: null, open_leads_count: 0, current_absence: null, ...o });
  expect(etatDeLAgent(a({ first_visit_at: '2026-11-10T09:30:00Z', current_absence: { ends_at: '2026-11-13', substitute: null } }))).toEqual({ genre: 'conge', fin: '2026-11-13' });
  expect(etatDeLAgent(a({ first_visit_at: '2026-11-10T09:30:00Z' }))).toEqual({ genre: 'premiereVisite', a: '2026-11-10T09:30:00Z' });
  expect(etatDeLAgent(a({}))).toEqual({ genre: 'rien' });
});

describe('titreEtQuartier — le quartier ne se redit pas', () => {
  it('ajoute le quartier absent du titre', () => {
    expect(titreEtQuartier('Villa contemporaine', 'Almadies', 'Bien')).toBe('Villa contemporaine · Almadies');
  });
  it('se tait quand le titre le porte déjà, casse et accents ignorés', () => {
    expect(titreEtQuartier('Appartement meublé Point E', 'Point E', 'Bien')).toBe('Appartement meublé Point E');
    expect(titreEtQuartier('Studio a sacre-coeur', 'Sacré-Cœur', 'Bien')).toBe('Studio a sacre-coeur');
  });
  it('sans titre, le repli ; sans quartier, le titre', () => {
    expect(titreEtQuartier('  ', 'Almadies', 'Visite #4')).toBe('Visite #4 · Almadies');
    expect(titreEtQuartier('Villa', null, 'Bien')).toBe('Villa');
  });
});
