import { describe, expect, it } from 'vitest';

import type { AdminAgencyUserRow } from '@/types/admin-users';

import { clesDeLaPastille, etatDuMembre, lireLEtat, presenceDe, requeteDeLaListe, roleDuMembre } from '../etat-de-l-equipe';

/** TCK-2667 — l'état de la page Équipe, porté par l'URL, et ce que la ligne dit d'un membre. */
const AGENCE = 12;
const lire = (q: string) => lireLEtat(new URLSearchParams(q));

function ligne(profils: Partial<AdminAgencyUserRow> = {}): AdminAgencyUserRow {
  return {
    id: 3,
    first_name: 'Awa',
    last_name: 'Test',
    email: 'awa@exemple.sn',
    phone: null,
    status: 'active',
    last_login_at: null,
    created_at: '2026-10-01T00:00:00Z',
    agent_profiles: [{ agency_id: AGENCE, status: 'active' }],
    owner_profiles: [],
    agency_admin_profiles: [],
    ...profils,
  };
}

describe('lireLEtat', () => {
  it('URL nue : la liste du personnel, triée par arrivée, page 1, sans fiche', () => {
    expect(lire('')).toEqual({
      vue: 'membres',
      pastille: 'tous',
      recherche: '',
      statut: '',
      tri: '-created_at',
      page: 1,
      membre: null,
      versLesBailleurs: false,
    });
  });

  it('lit la vue, la pastille, la fiche, et ignore les valeurs inconnues', () => {
    expect(lire('vue=performance').vue).toBe('performance');
    expect(lire('vue=invitations').vue).toBe('invitations');
    expect(lire('vue=n-importe').vue).toBe('membres');
    expect(lire('filter[role]=agent').pastille).toBe('agents');
    expect(lire('filter[role]=agency_admin').pastille).toBe('admins');
    expect(lire('filter[role]=agent&filter[absent]=1').pastille).toBe('absents');
    expect(lire('membre=7').membre).toBe(7);
    expect(lire('membre=0').membre).toBeNull();
    expect(lire('membre=7x').membre).toBeNull();
    expect(lire('page=-2').page).toBe(1);
    expect(lire('filter[status]=supprime').statut).toBe('');
    expect(lire('filter[status]=blocked').statut).toBe('blocked');
  });

  it('l’ancien onglet des bailleurs est reconnu pour être renvoyé, jamais listé ici', () => {
    const etat = lire('filter[role]=owner');
    expect(etat.versLesBailleurs).toBe(true);
    expect(requeteDeLaListe(etat).role).toBe('agent,agency_admin');
  });
});

describe('requeteDeLaListe', () => {
  it('demande toujours le personnel seul, avec son résumé', () => {
    expect(requeteDeLaListe(lire(''))).toMatchObject({ role: 'agent,agency_admin', absent: false, resume: true, perPage: 20 });
    expect(requeteDeLaListe(lire('filter[role]=agent')).role).toBe('agent');
    expect(requeteDeLaListe(lire('filter[absent]=1'))).toMatchObject({ role: 'agent,agency_admin', absent: true });
  });
});

describe('clesDeLaPastille', () => {
  it('pose sa clé, retire l’autre, fait tomber la page et la fiche', () => {
    expect(clesDeLaPastille('absents')).toEqual({ 'filter[role]': null, 'filter[absent]': '1', vue: null, page: null, membre: null });
    expect(clesDeLaPastille('agents')['filter[role]']).toBe('agent');
    expect(clesDeLaPastille('tous')).toMatchObject({ 'filter[role]': null, 'filter[absent]': null });
  });
});

describe('etatDuMembre et roleDuMembre', () => {
  it('suspendu quand aucun profil d’ici n’est actif ; un profil suspendu AILLEURS ne compte pas', () => {
    expect(etatDuMembre(ligne({ agent_profiles: [{ agency_id: AGENCE, status: 'suspended' }] }), AGENCE)).toBe('suspendu');
    expect(
      etatDuMembre(
        ligne({
          agent_profiles: [
            { agency_id: 99, status: 'suspended' },
            { agency_id: AGENCE, status: 'active' },
          ],
        }),
        AGENCE,
      ),
    ).toBe('actif');
  });

  it('absent quand une absence en cours est servie', () => {
    const absence = { starts_at: '2026-11-01T00:00:00Z', ends_at: '2026-11-20T00:00:00Z', substitute: null };
    expect(etatDuMembre(ligne({ current_absence: absence }), AGENCE)).toBe('absent');
  });

  it('administrateur dès qu’il tient un profil d’admin dans CETTE agence', () => {
    expect(roleDuMembre(ligne({ agency_admin_profiles: [{ agency_id: AGENCE, status: 'active' }] }), AGENCE)).toBe('agency_admin');
    expect(roleDuMembre(ligne({ agency_admin_profiles: [{ agency_id: 99, status: 'active' }] }), AGENCE)).toBe('agent');
  });
});

describe('presenceDe', () => {
  const maintenant = new Date('2026-11-12T10:00:00Z');
  it('aujourd’hui, hier, il y a N jours jusqu’à six, puis la date', () => {
    expect(presenceDe(null, maintenant)).toEqual({ forme: 'jamais' });
    expect(presenceDe('pas une date', maintenant)).toEqual({ forme: 'jamais' });
    expect(presenceDe('2026-11-12T00:30:00Z', maintenant)).toEqual({ forme: 'aujourdhui' });
    expect(presenceDe('2026-11-11T23:59:00Z', maintenant)).toEqual({ forme: 'hier' });
    expect(presenceDe('2026-11-06T09:00:00Z', maintenant)).toEqual({ forme: 'ilYa', jours: 6 });
    expect(presenceDe('2026-11-05T09:00:00Z', maintenant)).toEqual({ forme: 'le', date: '2026-11-05T09:00:00Z' });
  });
});
