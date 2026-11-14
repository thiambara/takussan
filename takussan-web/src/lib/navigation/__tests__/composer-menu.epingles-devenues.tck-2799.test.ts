import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '../catalogue';
import { composerMenu, EPINGLES_DEVENUES, epinglesMigrees } from '../composer-menu';
import type { ContexteDeMenu } from '../types';

/**
 * TCK-2799 (ADR-0096, amendement du 2026-11-14 § 5) — une épingle posée sur l'une des cinq vues que TCK-2628 a
 * fondues dans « Rapports » (« Vue agence », « Statistiques », « KPIs », « Alertes », « Exports ») se lit
 * « Rapports », au même endroit. Sans la table, le composeur ignorait l'identifiant inconnu : l'épingle
 * disparaissait sans bruit.
 */
const ADMIN: ContexteDeMenu = { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: [] };
const AGENT: ContexteDeMenu = { roles: ['customer', 'agent'], capacites: ['properties.create'] };
const LOCATAIRE: ContexteDeMenu = { roles: ['customer', 'tenant'], capacites: null };

const epinglees = (menu: ReturnType<typeof composerMenu>) => menu.groupes.find((g) => g.id === 'epingles')?.entrees.map((e) => e.id) ?? [];

describe('TCK-2799 — les épingles des vues fondues dans « Rapports »', () => {
  it('AC1 — `vue-agence` et `kpis` épinglées par l’admin : UNE épingle « Rapports », à la place de `vue-agence`', () => {
    const menu = composerMenu(ADMIN, 'admin-agence', undefined, { epingles: ['baux', 'vue-agence', 'clients', 'kpis'] });
    expect(menu.epingles).toEqual(['baux', 'rapports', 'clients']);
    expect(epinglees(menu)).toEqual(['baux', 'rapports', 'clients']);
  });

  it('AC1 — seules, elles rendent « Rapports » et rien d’autre', () => {
    expect(composerMenu(ADMIN, 'admin-agence', undefined, { epingles: ['vue-agence', 'kpis'] }).epingles).toEqual(['rapports']);
  });

  it('AC2 — `rapports` déjà épinglée : les anciennes s’effacent', () => {
    expect(composerMenu(ADMIN, 'admin-agence', undefined, { epingles: ['rapports', 'statistiques'] }).epingles).toEqual(['rapports']);
  });

  it('AC2 — `rapports` épinglée APRÈS une ancienne garde sa propre place', () => {
    expect(composerMenu(AGENT, 'agent', undefined, { epingles: ['statistiques', 'baux', 'rapports'] }).epingles).toEqual(['baux', 'rapports']);
  });

  it('AC3 — le locataire avec `statistiques` épinglée : aucune épingle', () => {
    const menu = composerMenu(LOCATAIRE, 'locataire', undefined, { epingles: ['statistiques'] });
    expect(menu.epingles).toEqual([]);
    expect(menu.groupes.some((g) => g.id === 'epingles')).toBe(false);
  });

  it('les cinq anciennes ne comptent qu’une fois dans les cinq places : la sixième épingle passe', () => {
    const menu = composerMenu(AGENT, 'agent', undefined, {
      epingles: ['statistiques', 'exports', 'baux', 'visites', 'demandes', 'clients'],
    });
    expect(menu.epingles).toEqual(['rapports', 'baux', 'visites', 'demandes', 'clients']);
  });

  it('la table ne vise que des destinations du catalogue, et aucune ancienne n’y est encore', () => {
    const ids = new Set<string>(CATALOGUE.map((d) => d.id));
    for (const [ancienne, devenue] of Object.entries(EPINGLES_DEVENUES)) {
      expect(ids.has(ancienne), ancienne).toBe(false);
      expect(ids.has(devenue), devenue).toBe(true);
    }
    expect(Object.keys(EPINGLES_DEVENUES).sort()).toEqual(['alertes', 'exports', 'kpis', 'statistiques', 'vue-agence']);
  });

  it('epinglesMigrees laisse passer le reste tel quel, inconnus compris (la composition les juge)', () => {
    expect(epinglesMigrees(['disparue', 'baux'])).toEqual(['disparue', 'baux']);
    expect(epinglesMigrees(['toString', 'constructor'])).toEqual(['toString', 'constructor']);
    expect(epinglesMigrees([])).toEqual([]);
  });
});
