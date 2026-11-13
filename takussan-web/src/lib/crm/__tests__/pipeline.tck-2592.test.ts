import { describe, expect, it } from 'vitest';

import { cleDeLaListe, cleDesFiltres, cleDUneColonne, filtresDeLaListe, filtresDesColonnes, filtresDUneColonne, lirePipeline, parametresDesStats, porteeParDefaut, totalDUneEtape } from '@/lib/crm/pipeline';
import type { PipelineStats } from '@/types/pipeline';

/**
 * TCK-2592 — l'état du pipeline, lu dans l'URL : la portée (Moi / Agence / un agent), la vue (Liste |
 * Étapes), le segment de la liste, l'étape choisie au portefeuille et les filtres ; et sa traduction en
 * lecture de l'API, la MÊME pour les colonnes et pour les statistiques (« Charger plus (x/total) »).
 */
const AGENT = { personnel: true, admin: false, agence: true };
const ADMIN = { personnel: true, admin: true, agence: true };
const AGENT_SANS_AGENCE = { personnel: true, admin: false, agence: false };
const BAILLEUR = { personnel: false, admin: false, agence: false };

describe('porteeParDefaut', () => {
  it("ouvre l'agent sur « Moi » et l'admin sur « Agence »", () => {
    expect(porteeParDefaut(AGENT)).toEqual({ type: 'moi' });
    expect(porteeParDefaut(ADMIN)).toEqual({ type: 'agence' });
  });

  it("un admin sans la lecture de l'agence (crm.view_all) retombe sur « Moi »", () => {
    expect(porteeParDefaut({ personnel: true, admin: true, agence: false })).toEqual({ type: 'moi' });
  });

  it('le bailleur n’a pas de portée', () => {
    expect(porteeParDefaut(BAILLEUR)).toBeNull();
  });
});

describe('lirePipeline', () => {
  it('lit la portée de l’URL, bornée à ce que le lecteur peut voir', () => {
    expect(lirePipeline({ portee: 'agence' }, AGENT).portee).toEqual({ type: 'agence' });
    expect(lirePipeline({ portee: '42' }, ADMIN).portee).toEqual({ type: 'agent', id: 42 });
    expect(lirePipeline({ portee: 'moi' }, ADMIN).portee).toEqual({ type: 'moi' });
    // Sans crm.view_all, « agence » tapé à la main retombe sur « Moi » : l'API rendrait 403.
    expect(lirePipeline({ portee: 'agence' }, AGENT_SANS_AGENCE).portee).toEqual({ type: 'moi' });
    expect(lirePipeline({ portee: '42' }, AGENT_SANS_AGENCE).portee).toEqual({ type: 'moi' });
    expect(lirePipeline({ portee: '0x2a' }, ADMIN).portee).toEqual({ type: 'agence' });
    expect(lirePipeline({ portee: 'agence' }, BAILLEUR).portee).toBeNull();
  });

  it('ouvre le personnel sur la Liste et le bailleur sur les Étapes', () => {
    expect(lirePipeline({}, AGENT).vue).toBe('liste');
    expect(lirePipeline({ vue: 'etapes' }, AGENT).vue).toBe('etapes');
    expect(lirePipeline({}, BAILLEUR).vue).toBe('etapes');
    expect(lirePipeline({ vue: 'kanban' }, ADMIN).vue).toBe('liste');
  });

  it('borne le segment, l’étape, la recherche, l’étiquette et « À relancer seulement »', () => {
    const e = lirePipeline({ segment: 'a-jour', etape: 'negotiating', search: ' awa ', tags: 'vip', relance: '1' }, ADMIN);
    expect(e.segment).toBe('a-jour');
    expect(e.etape).toBe('negotiating');
    expect(e.search).toBe('awa');
    expect(e.tags).toBe('vip');
    expect(e.relance).toBe(true);
    expect(e.sorties).toBe(false);
    expect(lirePipeline({ sorties: '1' }, ADMIN).sorties).toBe(true);
    expect(lirePipeline({ sorties: '1' }, ADMIN).sortiesDeLaPeriode).toBe(false);
    // Décision 1b — `sorties=30` : les mêmes étapes ouvertes, bornées à la période de la tuile.
    expect(lirePipeline({ sorties: '30' }, ADMIN).sorties).toBe(true);
    expect(lirePipeline({ sorties: '30' }, ADMIN).sortiesDeLaPeriode).toBe(true);
    expect(lirePipeline({ sorties: '7' }, ADMIN).sorties).toBe(false);
    const f = lirePipeline({ segment: 'x', etape: 'converted', relance: 'oui' }, ADMIN);
    expect(f.segment).toBe('tous');
    // Le portefeuille ne choisit qu'une étape vivante.
    expect(f.etape).toBeNull();
    expect(f.relance).toBe(false);
  });

  it('le bailleur n’a ni segment ni « À relancer seulement » : l’API ne lui rend aucune relance', () => {
    const e = lirePipeline({ segment: 'a-relancer', relance: '1' }, BAILLEUR);
    expect(e.segment).toBe('tous');
    expect(e.relance).toBe(false);
  });
});

describe('filtresDesColonnes et parametresDesStats', () => {
  it('« Moi » : referent=me aux colonnes, scope=mine aux statistiques (filter[referent] y est refusé)', () => {
    const e = lirePipeline({}, AGENT);
    expect(filtresDesColonnes(e)).toEqual({ status: 'active', referent: 'me' });
    expect(parametresDesStats(e)).toEqual({ scope: 'mine', filter: { status: 'active' } });
  });

  it('« Agence » : aucun référent ; un agent isolé : son identifiant, des deux côtés', () => {
    expect(filtresDesColonnes(lirePipeline({}, ADMIN))).toEqual({ status: 'active' });
    expect(parametresDesStats(lirePipeline({}, ADMIN))).toEqual({ scope: 'agency', filter: { status: 'active' } });
    const un = lirePipeline({ portee: '7' }, ADMIN);
    expect(filtresDesColonnes(un)).toEqual({ status: 'active', referent: '7' });
    expect(parametresDesStats(un)).toEqual({ scope: 'agency', filter: { status: 'active', referent: '7' } });
  });

  it('les filtres de la barre passent aux colonnes ET aux statistiques', () => {
    const e = lirePipeline({ search: 'awa', tags: 'vip', relance: '1' }, ADMIN);
    expect(filtresDesColonnes(e)).toEqual({ status: 'active', search: 'awa', tags: 'vip', follow_up: '1' });
    expect(parametresDesStats(e).filter).toEqual({ status: 'active', search: 'awa', tags: 'vip', follow_up: '1' });
  });

  it('le bailleur : ni portée ni référent', () => {
    const e = lirePipeline({}, BAILLEUR);
    expect(filtresDesColonnes(e)).toEqual({ status: 'active' });
    expect(parametresDesStats(e)).toEqual({ filter: { status: 'active' } });
  });

  it('la clé des filtres est stable et change avec eux', () => {
    const a = cleDesFiltres(lirePipeline({ search: 'awa', tags: 'vip' }, ADMIN));
    const b = cleDesFiltres(lirePipeline({ tags: 'vip', search: 'awa' }, ADMIN));
    expect(a).toBe(b);
    expect(cleDesFiltres(lirePipeline({ portee: 'moi' }, ADMIN))).not.toBe(cleDesFiltres(lirePipeline({}, ADMIN)));
  });
});

describe('filtresDeLaListe', () => {
  it('ajoute le segment et l’étape choisie aux filtres des colonnes', () => {
    const e = lirePipeline({ etape: 'qualified' }, AGENT);
    expect(filtresDeLaListe(e, 'a-relancer')).toEqual({ status: 'active', referent: 'me', follow_up: '1', pipeline_stage: 'qualified' });
    expect(filtresDeLaListe(e, 'a-jour')).toEqual({ status: 'active', referent: 'me', follow_up: '0', pipeline_stage: 'qualified' });
    expect(filtresDeLaListe(lirePipeline({}, ADMIN), 'tous')).toEqual({ status: 'active' });
  });

  it('le segment l’emporte sur « À relancer seulement », qui vaut pour « Tous »', () => {
    const e = lirePipeline({ relance: '1' }, ADMIN);
    expect(filtresDeLaListe(e, 'tous').follow_up).toBe('1');
    expect(filtresDeLaListe(e, 'a-jour').follow_up).toBe('0');
    expect(cleDeLaListe(e, 'a-jour')).not.toBe(cleDeLaListe(e, 'tous'));
  });
});

describe('les colonnes terminales sous `sorties=30` (décision 1b)', () => {
  const stats = {
    stage_counts: { lead: 3, prospect: 1, qualified: 0, negotiating: 2, converted: 40, lost: 30 },
    exits_last_30d: { converted: 4, lost: 3 },
  } as unknown as PipelineStats;

  it('bornent Gagné et Perdu à la période, sous leur propre clé, sans compte tiré des statistiques', () => {
    const e = lirePipeline({ sorties: '30' }, ADMIN);
    expect(filtresDUneColonne(e, 'converted')).toEqual({ status: 'active', exited_within_days: '30' });
    expect(filtresDUneColonne(e, 'lost')).toEqual({ status: 'active', exited_within_days: '30' });
    expect(filtresDUneColonne(e, 'lead')).toEqual(filtresDesColonnes(e));
    expect(cleDUneColonne(e, 'converted')).not.toBe(cleDUneColonne(lirePipeline({ sorties: '1' }, ADMIN), 'converted'));
    expect(cleDUneColonne(e, 'lead')).toBe(cleDesFiltres(e));
    // `exits_last_30d` compte des sorties du journal, pas les fiches de la colonne : elle se compte seule.
    expect(totalDUneEtape(e, stats, 'converted')).toBeUndefined();
    expect(totalDUneEtape(e, stats, 'lost')).toBeUndefined();
    expect(totalDUneEtape(e, stats, 'lead')).toBe(3);
  });

  it('`sorties=1` laisse les colonnes entières, comptées par étape', () => {
    const e = lirePipeline({ sorties: '1' }, ADMIN);
    expect(filtresDUneColonne(e, 'converted')).toEqual(filtresDesColonnes(e));
    expect(totalDUneEtape(e, stats, 'converted')).toBe(40);
  });
});
