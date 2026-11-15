/**
 * TCK-2590 — l'état de la liste des clients, lu dans l'URL : chaque vue émet son filtre de l'API, le
 * tri d'« À relancer » est `-follow_up_days` (AC2), `per_page` passe tel quel (AC4), et un lecteur hors
 * personnel n'a ni vues ni tri par prochaine action.
 */
import { describe, expect, it } from 'vitest';

import { lireLaListe, sensDeLaColonne, triAuClic, vuesDuLecteur } from '../liste-des-clients';

const AGENT = { personnel: true, admin: false };
const ADMIN = { personnel: true, admin: true };
const BAILLEUR = { personnel: false, admin: false };

describe('lireLaListe — les vues', () => {
  it('« À relancer » émet filter[follow_up]=1 et trie par -follow_up_days (AC2)', () => {
    const e = lireLaListe({ vue: 'a-relancer' }, AGENT);
    expect(e.vue).toBe('a-relancer');
    expect(e.filtres.follow_up).toBe('1');
    expect(e.tri).toBe('-follow_up_days');
  });

  it('« Mes clients » : referent=me ; « Négociation » : l’étape negotiating, qui l’emporte sur celle de l’URL', () => {
    expect(lireLaListe({ vue: 'mes-clients' }, AGENT).filtres.referent).toBe('me');
    const n = lireLaListe({ vue: 'negociation', pipeline_stage: 'lead' }, AGENT);
    expect(n.filtres.pipeline_stage).toBe('negotiating');
  });

  it('« Sans référent » est la vue de l’admin : referent=none pour lui, « Tous » pour l’agent', () => {
    expect(lireLaListe({ vue: 'sans-referent' }, ADMIN).filtres.referent).toBe('none');
    const agent = lireLaListe({ vue: 'sans-referent' }, AGENT);
    expect(agent.vue).toBe('tous');
    expect(agent.filtres.referent).toBeUndefined();
  });

  it('les vues du lecteur : quatre, « Sans référent » à la place de « Négociation » pour l’admin, aucune pour le bailleur', () => {
    expect(vuesDuLecteur(AGENT)).toEqual(['a-relancer', 'mes-clients', 'negociation', 'tous']);
    expect(vuesDuLecteur(ADMIN)).toEqual(['a-relancer', 'mes-clients', 'sans-referent', 'tous']);
    // L'admin garde la négociation par le filtre « Étape » ; la vue n'est pas la sienne.
    expect(lireLaListe({ vue: 'negociation' }, ADMIN).vue).toBe('tous');
    expect(vuesDuLecteur(BAILLEUR)).toEqual([]);
    expect(lireLaListe({ vue: 'a-relancer' }, BAILLEUR).filtres.follow_up).toBeUndefined();
  });

  it('les filtres d’avant passent tels quels (recherche, étape, statut, étiquettes, page)', () => {
    const e = lireLaListe({ search: 'fall', pipeline_stage: 'qualified', status: 'inactive', tags: 'vip,Garant', page: '3' }, AGENT);
    expect(e.filtres).toMatchObject({ search: 'fall', pipeline_stage: 'qualified', status: 'inactive', tags: 'vip,Garant' });
    expect(e.page).toBe(3);
    // TCK-702 — une recherche se classe par pertinence : aucun tri explicite.
    expect(e.tri).toBeUndefined();
  });
});

describe('lireLaListe — par page et tri', () => {
  it('per_page : 10, 20 ou 50 passent ; le reste retombe à 20 (AC4)', () => {
    expect(lireLaListe({ per_page: '50' }, AGENT).parPage).toBe(50);
    expect(lireLaListe({ per_page: '10' }, AGENT).parPage).toBe(10);
    expect(lireLaListe({ per_page: '500' }, AGENT).parPage).toBe(20);
    expect(lireLaListe({}, AGENT).parPage).toBe(20);
  });

  it('le tri par défaut : la prochaine action pour le personnel, la plus récente pour le bailleur', () => {
    expect(lireLaListe({}, AGENT).tri).toBe('next_action_at');
    expect(lireLaListe({}, BAILLEUR).tri).toBe('-created_at');
  });

  it('un tri d’URL est borné aux colonnes triables de l’API ; l’étape et le référent ne le sont pas', () => {
    expect(lireLaListe({ sort: '-last_name' }, AGENT).tri).toBe('-last_name');
    expect(lireLaListe({ sort: 'pipeline_stage' }, AGENT).tri).toBe('next_action_at');
    expect(lireLaListe({ sort: 'referent' }, AGENT).tri).toBe('next_action_at');
    // Hors personnel, la prochaine action est nulle partout : son tri n'a pas de sens.
    expect(lireLaListe({ sort: 'next_action_at' }, BAILLEUR).tri).toBe('-created_at');
  });

  it('un clic sur l’en-tête : croissant, puis décroissant', () => {
    expect(triAuClic('next_action_at', 'client')).toBe('last_name');
    expect(triAuClic('last_name', 'client')).toBe('-last_name');
    expect(triAuClic('-last_name', 'client')).toBe('last_name');
    expect(sensDeLaColonne('-last_name', 'client')).toBe('desc');
    expect(sensDeLaColonne('next_action_at', 'prochaine')).toBe('asc');
    expect(sensDeLaColonne('next_action_at', 'client')).toBeNull();
  });
});
