/**
 * TCK-2928 — « Clients et visites » de la fiche d'un membre ouvre `/app/customers?referent={id}` : la
 * liste le lit et le passe à l'API en `filter[referent]={id}` (TCK-2588), filtre serveur. Seul un
 * identifiant passe ; une vue qui pose son propre référent l'emporte ; hors personnel, rien.
 */
import { describe, expect, it } from 'vitest';

import { lienDesClientsDuMembre } from '@/lib/queries/fiche-du-membre';

import { lireLaListe } from '../liste-des-clients';

const ADMIN = { personnel: true, admin: true };

describe('lireLaListe — referent (TCK-2928)', () => {
  it('le lien de la fiche devient `filter[referent]={id}`', () => {
    const requete = new URLSearchParams(lienDesClientsDuMembre(3).split('?')[1]);
    expect(lireLaListe(Object.fromEntries(requete), ADMIN).filtres.referent).toBe('3');
  });

  it('une valeur qui n’est pas un identifiant est ignorée (jamais un 422)', () => {
    expect(lireLaListe({ referent: 'tous' }, ADMIN).filtres.referent).toBeUndefined();
    expect(lireLaListe({ referent: '0' }, ADMIN).filtres.referent).toBeUndefined();
  });

  it('une vue qui pose son référent l’emporte ; hors personnel, aucun filtre', () => {
    expect(lireLaListe({ vue: 'mes-clients', referent: '3' }, ADMIN).filtres.referent).toBe('me');
    expect(lireLaListe({ referent: '3' }, { personnel: false, admin: false }).filtres.referent).toBeUndefined();
  });
});
