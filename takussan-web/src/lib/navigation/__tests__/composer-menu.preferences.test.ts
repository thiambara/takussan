import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../catalogue';
import { composerMenu, entreesDuMenu, type MenuCompose } from '../composer-menu';
import { PERSONAS } from '../personas';
import type { ContexteDeMenu } from '../types';

const AGENT: ContexteDeMenu = { roles: ['customer', 'agent'], capacites: ['properties.create'] };
const ADMIN: ContexteDeMenu = { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: [] };
const CUMUL: ContexteDeMenu = { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: [] };
const LOCATAIRE: ContexteDeMenu = { roles: ['customer', 'tenant'], capacites: null };

const ids = (menu: MenuCompose, groupe: string) => menu.groupes.find((g) => g.id === groupe)?.entrees.map((e) => e.id) ?? [];
const groupe = (menu: MenuCompose, id: string) => menu.groupes.find((g) => g.id === id);

describe('TCK-2480 — composerMenu applique les préférences du persona (ADR-0089 §4)', () => {
  it('AC1 — épingler « Commissions » la monte dans « Épinglés », en tête, et la retire de « Gestion »', () => {
    const menu = composerMenu(AGENT, 'agent', undefined, { epingles: ['commissions'] });
    expect(menu.groupes[0]).toMatchObject({ id: 'epingles', titre: 'epingles', replie: false, replieParDefaut: false });
    expect(ids(menu, 'epingles')).toEqual(['commissions']);
    expect(ids(menu, 'gestion')).not.toContain('commissions');
    expect(menu.groupes[0].entrees[0]).toMatchObject({ epinglee: true, epinglable: true });
    expect(menu.epingles).toEqual(['commissions']);
  });

  it('sans préférence, le menu est exactement celui de la disposition', () => {
    expect(composerMenu(AGENT, 'agent', undefined, {})).toEqual(composerMenu(AGENT, 'agent'));
    expect(composerMenu(AGENT, 'agent').groupes.some((g) => g.id === 'epingles')).toBe(false);
  });

  it('les épingles gardent l’ordre de l’utilisateur', () => {
    expect(composerMenu(AGENT, 'agent', undefined, { epingles: ['commissions', 'baux'] }).epingles).toEqual(['commissions', 'baux']);
  });

  it('AC4 — un identifiant inconnu ou une destination fermée au persona est ignoré', () => {
    const menu = composerMenu(AGENT, 'agent', undefined, { epingles: ['disparue', 'agence-equipe', 'commissions'] });
    expect(ids(menu, 'epingles')).toEqual(['commissions']);
    expect(menu.epingles).toEqual(['commissions']);
  });

  it('AC4 — ce que seul un AUTRE profil ouvre ne s’épingle pas : il reste dans « Aussi … »', () => {
    const menu = composerMenu(CUMUL, 'admin-agence', undefined, { epingles: ['paiements'] });
    expect(groupe(menu, 'epingles')).toBeUndefined();
    expect(ids(menu, 'aussi')).toContain('paiements');
    expect(groupe(menu, 'aussi')?.entrees.every((e) => e.epinglable === undefined)).toBe(true);
  });

  it('l’action principale et la carte ne s’épinglent pas', () => {
    const menu = composerMenu(LOCATAIRE, 'locataire', undefined, { epingles: ['paiements', 'publier-annonce'] });
    expect(groupe(menu, 'epingles')).toBeUndefined();
    const paiements = groupe(menu, 'mon-logement')?.entrees.find((e) => e.id === 'paiements');
    expect(paiements).toBeDefined();
    expect(paiements?.epinglable).toBeUndefined();
  });

  it('cinq épingles au plus : au-delà, ignorées', () => {
    const six = ['commissions', 'baux', 'visites', 'demandes', 'clients', 'calendrier'];
    expect(composerMenu(AGENT, 'agent', undefined, { epingles: six }).epingles).toEqual(six.slice(0, 5));
  });

  it('replis : un groupe ouvert se replie, un replié s’ouvre ; un groupe sans titre, jamais', () => {
    const menu = composerMenu(AGENT, 'agent', undefined, { replies: ['gestion', 'tete'], ouverts: ['plus'] });
    expect(groupe(menu, 'gestion')).toMatchObject({ replie: true, replieParDefaut: false });
    expect(groupe(menu, 'plus')).toMatchObject({ replie: false, replieParDefaut: true });
    expect(groupe(menu, 'tete')).toMatchObject({ replie: false });
    // « Pilotage » (replié par défaut chez l'admin) — pas « Agence » : sans `cheminsAdmin`, ses pages
    // d'agence sont fermées et le groupe vide ne se rend pas.
    const admin = composerMenu(ADMIN, 'admin-agence', undefined, { ouverts: ['pilotage'] });
    expect(groupe(admin, 'pilotage')).toMatchObject({ replie: false, replieParDefaut: true });
    expect(groupe(composerMenu(ADMIN, 'admin-agence'), 'pilotage')).toMatchObject({ replie: true, replieParDefaut: true });
  });

  it('« Démarrer » masqué par l’utilisateur : `demarrer` est nul (TCK-2479 l’enregistre ici)', () => {
    expect(composerMenu(ADMIN, 'admin-agence').demarrer).toBe('espace');
    expect(composerMenu(ADMIN, 'admin-agence', undefined, { demarrer_masque: true }).demarrer).toBeNull();
  });

  it.each(PERSONAS)('%s : épingler ne perd ni n’ajoute aucune destination', (persona) => {
    const tous: ContexteDeMenu = {
      roles: ['customer', 'tenant', 'owner', 'agent', 'agency_admin', 'service_provider'],
      capacites: ['properties.create'],
      cheminsAdmin: [],
    };
    const hrefs = (m: MenuCompose) => new Set([...entreesDuMenu(m).map((e) => e.href), ...(m.carte ? [m.carte.href] : [])]);
    const sans = composerMenu(tous, persona);
    const avec = composerMenu(tous, persona, undefined, { epingles: CATALOGUE.map((d) => d.id) });
    expect(hrefs(avec)).toEqual(hrefs(sans));
    expect(avec.epingles.length).toBeLessThanOrEqual(5);
  });
});
