/**
 * TCK-2857 — « Grouper par » et « Rattachée à » dans l'URL et la requête ; le regroupement par client
 * ou bien ; le lien « Nouvelle tâche » d'une fiche.
 */
import { describe, expect, it } from 'vitest';

import { lienNouvelleTache, lirePour } from '../lien-nouvelle-tache';
import { filtreDeLaListe, filtreDuCompte, grouperParRattachement, lireEtat, rechercheDe } from '../taches';

describe('TCK-2857 — Grouper par, Rattachée à', () => {
  it('lit et réécrit `?grouper=…&rattachement=…`, combinés aux pastilles ; les défauts restent hors de l’URL', () => {
    const etat = lireEtat({ 'filter[due]': 'today', grouper: 'rattachement', rattachement: 'clients' });
    expect(etat.grouper).toBe('rattachement');
    expect(etat.rattachement).toBe('customer');
    expect(rechercheDe(etat)).toBe('filter[due]=today&grouper=rattachement&rattachement=clients');
    expect(rechercheDe(lireEtat({}))).toBe('');
    expect(lireEtat({ grouper: 'x', rattachement: 'y' })).toMatchObject({ grouper: 'echeance', rattachement: 'tout' });
    expect(rechercheDe(lireEtat({ rattachement: 'biens' }))).toBe('rattachement=biens');
  });

  it('« Clients » filtre la liste ET les comptes sur le type morph stocké', () => {
    const etat = lireEtat({ rattachement: 'clients' });
    expect(filtreDeLaListe(etat)).toEqual({ taskable_type: 'App\\Models\\Customer', due: 'overdue,today' });
    expect(filtreDuCompte(etat, 'done')).toEqual({ taskable_type: 'App\\Models\\Customer', status: 'done' });
    expect(filtreDeLaListe(lireEtat({ rattachement: 'biens' })).taskable_type).toBe('App\\Models\\Property');
    expect(filtreDeLaListe(lireEtat({}))).not.toHaveProperty('taskable_type');
  });

  it('regroupe par client ou bien (type + id), les tâches sans rattachement en dernier', () => {
    const mariama = { type: 'customer' as const, id: 4, label: 'Mariama Fall', phone: null };
    const bien4 = { type: 'property' as const, id: 4, label: 'F2 Grand Yoff', phone: null };
    const groupes = grouperParRattachement([
      { id: 1, taskable: null },
      { id: 2, taskable: mariama },
      { id: 3, taskable: bien4 },
      { id: 4, taskable: { ...mariama } },
    ]);
    expect(groupes.map((g) => [g.cle, g.taches.map((t) => t.id)])).toEqual([
      ['customer:4', [2, 4]],
      ['property:4', [3]],
      ['sans', [1]],
    ]);
  });
});

describe('TCK-2857 — le lien « Nouvelle tâche » d’une fiche', () => {
  it('porte le genre et l’id, jamais le nom, et se relit', () => {
    expect(lienNouvelleTache('customer', 12)).toBe('/app/tasks?nouvelle=1&pour=customer:12');
    expect(lirePour('property:8')).toEqual({ type: 'property', id: 8 });
    expect(lirePour('customer:0')).toBeNull();
    expect(lirePour('booking:3')).toBeNull();
    expect(lirePour(['customer:1'])).toBeNull();
    expect(lirePour(undefined)).toBeNull();
  });
});
