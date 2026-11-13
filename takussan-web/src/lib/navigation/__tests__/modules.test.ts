import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, type IdDestination } from '../catalogue';
import { composerMenu, entreesDuMenu } from '../composer-menu';
import { DISPOSITIONS } from '../dispositions';
import { CODES_DE_MODULE, destinationsMasquees, MODULES_D_AGENCE, modulesMasquesDe } from '../modules';
import { PERSONAS } from '../personas';
import type { ContexteDeMenu } from '../types';

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence ») — les gardes des modules : ce qui ne se
 * masque jamais, et les portes par lesquelles le masquage ne se contourne pas.
 */
const PAR_ID = new Map(CATALOGUE.map((d) => [d.id, d]));
const MASQUABLES = CODES_DE_MODULE.flatMap((c) => MODULES_D_AGENCE[c]);
/** La liste de l'amendement, point 3. Le reste des interdits est une RÈGLE, éprouvée plus bas. */
const JAMAIS: readonly IdDestination[] = ['tableau-de-bord', 'messagerie', 'mes-biens', 'baux', 'paiements', 'demandes'];

describe('TCK-2483 — les modules d’agence', () => {
  it('chaque module retire au moins une destination, et une destination n’est que dans un module', () => {
    for (const code of CODES_DE_MODULE) expect(MODULES_D_AGENCE[code].length, code).toBeGreaterThan(0);
    expect(new Set(MASQUABLES).size).toBe(MASQUABLES.length);
  });

  it('jamais l’indispensable (liste de l’amendement)', () => {
    expect(MASQUABLES.filter((id) => JAMAIS.includes(id))).toEqual([]);
  });

  it('jamais par règle : compteur, page d’agence, écriture, jugée sur l’espace, action principale, onglet', () => {
    const actions = new Set<string>(PERSONAS.flatMap((p) => DISPOSITIONS[p].action));
    // Un onglet mobile se décide par persona (TCK-2481) : en masquer un laisserait sa place au suivant
    // de la disposition, ce que personne n'a décidé.
    const onglets = new Set<string>(PERSONAS.flatMap((p) => DISPOSITIONS[p].onglets));
    for (const id of MASQUABLES) {
      const d = PAR_ID.get(id)!;
      expect(d, `${id} n’existe pas au catalogue`).toBeDefined();
      expect(d.compteur, `${id} porte un compteur : ce qui attend ne disparaît pas`).toBeUndefined();
      expect(d.espace, `${id} est une page d’agence (PAGES_ADMIN)`).toBeUndefined();
      expect(d.ecriture, id).toBeUndefined();
      expect(d.surLEspace, id).toBeUndefined();
      expect(actions.has(id), `${id} est une action principale`).toBe(false);
      expect(onglets.has(id), `${id} est un onglet mobile`).toBe(false);
    }
  });

  it('chaque destination masquable est au menu de l’agent ou de l’admin (sinon le module ne retire rien)', () => {
    const admin: ContexteDeMenu = { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: [] };
    const agent: ContexteDeMenu = { roles: ['customer', 'agent'], capacites: ['properties.create'], cheminsAdmin: [] };
    const rendus = new Set(
      [...entreesDuMenu(composerMenu(admin, 'admin-agence')), ...entreesDuMenu(composerMenu(agent, 'agent'))].map((e) => e.id),
    );
    expect(MASQUABLES.filter((id) => !rendus.has(id))).toEqual([]);
  });

  it('lit `settings.hidden_modules` avec tolérance, dans l’ordre des codes', () => {
    expect(modulesMasquesDe(null)).toEqual([]);
    expect(modulesMasquesDe(undefined)).toEqual([]);
    expect(modulesMasquesDe({})).toEqual([]);
    expect(modulesMasquesDe({ hidden_modules: null })).toEqual([]);
    expect(modulesMasquesDe({ hidden_modules: 'calendar' })).toEqual([]);
    expect(modulesMasquesDe({ hidden_modules: { a: 'calendar' } })).toEqual([]);
    expect(modulesMasquesDe({ hidden_modules: ['analytics', 'obsolete', 3, 'calendar', 'calendar'] })).toEqual(['calendar', 'analytics']);
  });

  it('destinationsMasquees déroule les modules et ignore un code inconnu', () => {
    expect([...destinationsMasquees(['analytics', 'obsolete'])].sort()).toEqual(['alertes', 'exports', 'kpis']);
    expect(destinationsMasquees([]).size).toBe(0);
  });

  // TCK-2644 (AC8) — `move_in_follow_up` a quitté la liste : une agence qui l'avait enregistré garde
  // un menu entier, sans erreur, et la valeur ne masque rien.
  it('une agence dont `hidden_modules` vaut ["move_in_follow_up"] : la valeur est ignorée, le menu se rend entier', () => {
    expect(CODES_DE_MODULE).not.toContain('move_in_follow_up');
    const lus = modulesMasquesDe({ hidden_modules: ['move_in_follow_up'] });
    expect(lus).toEqual([]);
    expect(modulesMasquesDe({ hidden_modules: ['move_in_follow_up', 'calendar'] })).toEqual(['calendar']);
    const ctx: ContexteDeMenu = { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: [] };
    for (const persona of ['agent', 'admin-agence'] as const) {
      const sans = entreesDuMenu(composerMenu({ ...ctx, masquees: destinationsMasquees([]) }, persona)).map((e) => e.id);
      const avec = entreesDuMenu(composerMenu({ ...ctx, masquees: destinationsMasquees(lus) }, persona)).map((e) => e.id);
      expect(avec, persona).toEqual(sans);
      expect(avec, persona).toContain('baux');
    }
  });
});

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' ? [] : fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : [];
  });
}

describe('TCK-2483 — le masquage ne se contourne pas', () => {
  const SOURCES = fichiers(SRC).map((f) => ({ f: relative(SRC, f), texte: readFileSync(f, 'utf8') }));

  /**
   * Qui écrit `f(` dans son source (définition comprise), trié. Une liste NOMINATIVE, jamais un
   * préfixe : revue de TCK-2483, M2 — l'exclusion de tout `lib/navigation/` laissait passer
   * `lib/navigation/palette.ts`, précisément la logique que l'amendement §6 vise.
   */
  const appelantsDe = (f: string): string[] =>
    SOURCES.filter(({ texte }) => new RegExp(`\\b${f}\\(`).test(texte))
      .map(({ f: chemin }) => chemin)
      .sort();

  // Relevé le 2026-11-06 (`grep -rn "estOuverte(" src`) : la définition et le compositeur, seuls.
  it('seul le compositeur appelle `estOuverte` (la palette et tout le reste lisent le menu composé)', () => {
    expect(appelantsDe('estOuverte')).toEqual(['lib/navigation/catalogue.ts', 'lib/navigation/composer-menu.ts']);
  });

  // Re-mesuré le 2026-11-06 : l'appelant est `components/layout/useMenuDeLEspace.ts` (TCK-2481), le
  // hook que partagent la barre, la barre d'onglets et la palette — pas `AppSidebar`.
  //
  // Une exception NOMINATIVE (TCK-2670) : l'aperçu du menu de la fiche de l'agence compose le menu
  // d'un agent SANS masque, pour y montrer barrées les entrées que la saisie masque. Ce n'est pas
  // une surface de navigation : aucune de ses lignes n'est un lien.
  it('tout appelant de `composerMenu` pose `masquees` (`destinationsMasquees`)', () => {
    const APERCU_SANS_MASQUE = ['components/admin-agency/fiche/SectionMenu.tsx'];
    const appelants = SOURCES.filter(
      ({ f, texte }) => !f.startsWith('lib/navigation/') && !APERCU_SANS_MASQUE.includes(f) && /\bcomposerMenu\(/.test(texte),
    );
    expect(appelants.length, 'aucun appelant trouvé : le motif est à revoir').toBeGreaterThan(0);
    expect(appelants.filter(({ texte }) => !/\bmasquees:\s*destinationsMasquees\(/.test(texte)).map(({ f }) => f)).toEqual([]);
  });

  it('`hidden_modules` n’est lu par aucune page ni aucune garde — affichage seulement', () => {
    // TCK-2670 — la fiche de l'agence l'édite : son schéma, sa section « Menu » et son compte de modifications.
    const AUTORISES = [
      'lib/navigation/modules.ts',
      'lib/schemas/agency.ts',
      'types/agency.ts',
      'lib/agence/fiche.ts',
      'components/admin-agency/fiche/SectionMenu.tsx',
      'components/admin-agency/fiche/FicheDeLAgence.tsx',
    ];
    const lecteurs = SOURCES.filter(({ texte }) => texte.includes('hidden_modules')).map(({ f }) => f);
    expect(lecteurs.filter((f) => !AUTORISES.includes(f))).toEqual([]);
  });

  // Revue de TCK-2483, M3 — lire le masque sans écrire `hidden_modules` : par ses deux lecteurs.
  // Relevé le 2026-11-06 : le layout de `/app` (qui le passe à la coque), la fiche de l'agence (qui
  // l'édite, par `reglagesDeLaFiche()` de `lib/schemas/agency.ts` depuis TCK-2486), le hook du menu
  // (qui le passe au compositeur) — et `modules.ts`, qui les définit.
  it('le masque n’est lu (`modulesMasquesDe`, `destinationsMasquees`) que par le menu et la fiche', () => {
    expect(appelantsDe('modulesMasquesDe')).toEqual([
      'app/(dashboard)/app/layout.tsx',
      'lib/navigation/modules.ts',
      'lib/schemas/agency.ts',
    ]);
    expect(appelantsDe('destinationsMasquees')).toEqual(['components/layout/useMenuDeLEspace.ts', 'lib/navigation/modules.ts']);
  });
});
