/**
 * TCK-2684 — la logique de comparaison de l'outil de fidélité (`scripts/fidelite/comparer.mjs`),
 * éprouvée sur fixtures JSON, sans Chrome : la CI n'a ni l'application servie ni la base de démo.
 *
 * Fixtures : deux relevés RÉELS de la maquette `app-notifications/a/1` (« Historique »), téléphone,
 * pris par l'outil le 2026-11-11 — l'un tel quel, l'autre après les six perturbations de l'essai E2
 * (annexe D, § 4.2 ; `scripts/fidelite/fixtures/perturber-e2.txt`, chacune vérifiée avant → après).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { choisir, comparerReleves, egalCouleur, ecartsDe, extraireLibelles, motifsDeDisposition, motifsDeRejet, rapportMarkdown, TOLERANCES } from '../../scripts/fidelite/comparer.mjs';

const ICI = join(__dirname, '../../scripts/fidelite');
const lire = (f: string) => JSON.parse(readFileSync(join(ICI, f), 'utf8'));
const maquette = lire('fixtures/notifications-a-1-telephone.json');
const perturbe = lire('fixtures/notifications-a-1-telephone-perturbe.json');
const fiche = lire('fixtures/roles-sensibilite.json');
const coque = lire('roles-coque.json');
const libelles = extraireLibelles(JSON.parse(readFileSync(join(__dirname, '../messages/fr.json'), 'utf8')));
/**
 * TCK-2738 — les deux fixtures sont des relevés de MAQUETTE, l'un tenant lieu de produit : leur barre
 * d'onglets ne porte pas `data-slot="barre-onglets"`, que le rôle commun vise côté produit. Le côté
 * produit de ce rôle reprend donc ici le sélecteur de la maquette ; le sélecteur réel est éprouvé
 * plus bas (« le rôle commun vise la barre d'onglets par son slot »).
 */
type Role = { nom: string; maquette: unknown; produit: unknown };
const rolesDeCoqueDesFixtures = (coque.roles as Role[]).map((r) =>
  r.nom === "coque · barre d'onglets" ? { ...r, produit: r.maquette } : r,
);
const roles = { ...fiche, roles: [...rolesDeCoqueDesFixtures, ...fiche.roles], zones: coque.zones };

type Ligne = { origine: string; nom: string; statut: string; ecarts: { propriete: string }[] };
const ecartsDuRapport = (lignes: Ligne[]) => lignes.filter((l) => l.statut === 'écart').flatMap((l) => l.ecarts.map((e) => `${l.nom} :: ${e.propriete}`));

/** Les six écarts injectés : l'élément (tel que le rapport le nomme) et la propriété. */
const SIX = [
  ["coque · barre d'onglets", 'hauteur'],
  ['ligne « Bien à valider » › texte 1', 'graisse'],
  ['intertitre de jour › texte 1', 'couleur'],
  ['Tout', 'marge gauche'],
  ['Confirmer', 'rayon'],
  ['Répondre', 'couleur de bordure'],
] as const;

/**
 * Les seuls éléments que les perturbations touchent (un écart ailleurs serait un faux positif).
 * « Cette semaine » est le texte de l'intertitre de jour : depuis TCK-2634 c'est un libellé de
 * `fr.json` (`notifications.jours.semaine`), donc une ancre automatique, et la couleur perturbée de
 * l'intertitre y est vue une seconde fois — le même élément, pas un intrus.
 */
const ELEMENTS_PERTURBES = ["coque · barre d'onglets", 'ligne « Bien à valider »', 'intertitre de jour', 'Cette semaine', 'Tout', 'Confirmer', 'Répondre'];

describe('fidélité — déterminisme', () => {
  it('un relevé comparé à lui-même rend 0 écart et 0 absent', () => {
    const r = comparerReleves(maquette, maquette, { roles, libelles });
    expect(r.compte.ecarts).toBe(0);
    expect(r.compte.absentsDuProduit + r.compte.absentsDeLaMaquette).toBe(0);
    expect(r.compte.conformes).toBeGreaterThan(40);
  });

  it('deux comparaisons des mêmes relevés rendent le même rapport, sans modifier les entrées', () => {
    const avant = JSON.stringify(maquette);
    const a = comparerReleves(maquette, perturbe, { roles, libelles });
    const b = comparerReleves(maquette, perturbe, { roles, libelles });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(rapportMarkdown(maquette, perturbe, a, null)).toBe(rapportMarkdown(maquette, perturbe, b, null));
    expect(JSON.stringify(maquette)).toBe(avant);
  });
});

describe('fidélité — sensibilité (E2 : six écarts injectés)', () => {
  const r = comparerReleves(maquette, perturbe, { roles, libelles });
  const ecarts = ecartsDuRapport(r.lignes);

  it.each(SIX)('rapporte « %s » sur la propriété « %s »', (element, propriete) => {
    expect(ecarts.some((e) => e.startsWith(element) && e.endsWith(`:: ${propriete}`))).toBe(true);
  });

  it('aucun écart hors des six éléments perturbés, aucun absent', () => {
    const intrus = ecarts.filter((e) => !ELEMENTS_PERTURBES.some((el) => e.startsWith(el)));
    expect(intrus).toEqual([]);
    expect(r.compte.absentsDuProduit + r.compte.absentsDeLaMaquette).toBe(0);
  });
});

describe('fidélité — tolérances (annexe D, § 6.3)', () => {
  const boite = maquette.noeuds.find((n: { type: string; cle: string }) => n.type === 'boite' && n.cle === 'Confirmer');
  const texte = maquette.noeuds.find((n: { type: string; cle: string }) => n.type === 'texte' && n.cle === 'Tout');
  const icone = maquette.noeuds.find((n: { type: string }) => n.type === 'icone');
  const avec = <T extends { r: object }>(n: T, patch: object) => ({ ...n, ...patch });

  it('dimension : ±1 px passe, 2 px rapporte', () => {
    expect(ecartsDe(boite, avec(boite, { r: { ...boite.r, h: boite.r.h + 1 } }))).toEqual([]);
    expect(ecartsDe(boite, avec(boite, { r: { ...boite.r, h: boite.r.h + 2 } })).map((e) => e.propriete)).toEqual(['hauteur']);
  });

  it('position : ±2 px passe, 3 px rapporte', () => {
    expect(ecartsDe(boite, avec(boite, { r: { ...boite.r, y: boite.r.y + 2 } }))).toEqual([]);
    expect(ecartsDe(boite, avec(boite, { r: { ...boite.r, y: boite.r.y + 3 } })).map((e) => e.propriete)).toEqual(['y']);
  });

  it('marge : ±1 px passe, 2 px rapporte', () => {
    const m = [...boite.marges];
    m[3] += 1;
    expect(ecartsDe(boite, avec(boite, { marges: m }))).toEqual([]);
    m[3] += 1;
    expect(ecartsDe(boite, avec(boite, { marges: m })).map((e) => e.propriete)).toEqual(['marge gauche']);
  });

  it('couleur : ±3/255 par canal passe, 4 rapporte ; alpha ±0,02', () => {
    expect(egalCouleur([10, 10, 10, 1], [13, 7, 10, 1])).toBe(true);
    expect(egalCouleur([10, 10, 10, 1], [14, 10, 10, 1])).toBe(false);
    expect(egalCouleur([10, 10, 10, 0.5], [10, 10, 10, 0.52])).toBe(true);
    expect(egalCouleur([10, 10, 10, 0.5], [10, 10, 10, 0.53])).toBe(false);
    expect(egalCouleur(null, [10, 10, 10, 1])).toBe(false);
  });

  it('police, taille, graisse, casse : exactes', () => {
    expect(ecartsDe(texte, avec(texte, { taille: texte.taille + 0.5 })).map((e) => e.propriete)).toEqual(['taille de police']);
    expect(ecartsDe(texte, avec(texte, { police: 'Arial' })).map((e) => e.propriete)).toEqual(['police']);
    expect(ecartsDe(texte, avec(texte, { casse: 'uppercase' })).map((e) => e.propriete)).toEqual(['casse']);
  });

  it('rayon, bordure, ombre : exacts', () => {
    expect(ecartsDe(boite, avec(boite, { rayon: boite.rayon.map((x: number) => x + 0.5) })).map((e) => e.propriete)).toEqual(['rayon']);
    expect(ecartsDe(boite, avec(boite, { bords: [2, 2, 2, 2] })).map((e) => e.propriete)).toContain('bordure');
    expect(ecartsDe(boite, avec(boite, { ombre: 'rgba(0, 0, 0, 0.1) 0px 1px 2px 0px' })).map((e) => e.propriete)).toEqual(['ombre']);
  });

  it('icône : taille et trait exacts', () => {
    expect(ecartsDe(icone, avec(icone, { r: { ...icone.r, w: icone.r.w + 1 } })).map((e) => e.propriete)).toEqual(['largeur']);
    expect(ecartsDe(icone, avec(icone, { trait: '2.5' })).map((e) => e.propriete)).toEqual(['trait']);
  });

  it('TCK-2685 — le trait calculé (« 1.5px ») et l’attribut gelé (« 1.5 ») sont le même trait ; 1.5 ≠ 1.75', () => {
    expect(ecartsDe(avec(icone, { trait: '1.5' }), avec(icone, { trait: '1.5px' }))).toEqual([]);
    expect(ecartsDe(avec(icone, { trait: '1.75' }), avec(icone, { trait: '1.5px' })).map((e) => e.propriete)).toEqual(['trait']);
  });

  it('les tolérances par défaut sont celles d’ADR-0106 § 5', () => {
    expect(TOLERANCES).toMatchObject({ position: 2, taille: 1, marge: 1, couleur: 3, alpha: 0.02, zone: 0.5 });
  });
});

describe('fidélité — échec bruyant', () => {
  const attendu = { W: 390, H: 844, rem: [16], spacingPx: 4 };
  const bon = { rem: 16, spacingPx: 4, polices: 'loaded', largeur: 390, hauteur: 844, echelle: 1, noeuds: 80 };

  it('un relevé conforme ne porte aucun motif', () => {
    expect(motifsDeRejet(bon, attendu)).toEqual([]);
  });

  it.each([
    ['échelle < 1', { echelle: 0.73 }],
    ['largeur', { largeur: 1438 }],
    ['rem', { rem: 14.4 }],
    ['densité', { spacingPx: 3.6 }],
    ['polices', { polices: 'loading' }],
    ['relevé vide', { noeuds: 0 }],
    ['404', { statut: 404 }],
  ])('refuse : %s', (_, patch) => {
    expect(motifsDeRejet({ ...bon, ...patch }, attendu)).toHaveLength(1);
  });

  it('refuse une redirection et un écran que la visionneuse a résolu ailleurs', () => {
    expect(motifsDeRejet({ ...bon, chemin: '/auth/login' }, { ...attendu, chemin: '/app/notifications' })).toHaveLength(1);
    expect(motifsDeRejet({ ...bon, ecranObtenu: 'app-accueil/a/0' }, { ...attendu, ecran: 'app-inconnue/a/0' })).toHaveLength(1);
  });

  it('le bureau accepte rem 14,4 (avant TCK-2692) ou 16 (après), toujours à densité ×0,9', () => {
    const bureau = { W: 1440, H: 900, rem: [14.4, 16], spacingPx: 3.6 };
    const b = { ...bon, largeur: 1440, hauteur: 900 };
    expect(motifsDeRejet({ ...b, rem: 14.4, spacingPx: 3.6 }, bureau)).toEqual([]);
    expect(motifsDeRejet({ ...b, rem: 16, spacingPx: 3.6 }, bureau)).toEqual([]);
    expect(motifsDeRejet({ ...b, rem: 16, spacingPx: 4 }, bureau)).toHaveLength(1);
  });

  it('refuse deux relevés d’appareils différents', () => {
    expect(() => comparerReleves(maquette, { ...maquette, appareil: 'bureau-1440', W: 1440, H: 900 })).toThrow(/incomparables/);
  });

  it('refuse la disposition d’un client là où l’écran est celui d’un locataire (AC8)', () => {
    const personas = lire('personas.json');
    const locataire = personas.dispositions.locataire;
    const client = personas.dispositions.client;
    expect(motifsDeDisposition(['/app', '/app/payments', '/app/maintenance', '/app/messages'], locataire, 'locataire')).toEqual([]);
    expect(motifsDeDisposition(['/app', '/app/favorites', '/app/visits', '/app/messages'], locataire, 'locataire').length).toBeGreaterThan(0);
    expect(motifsDeDisposition(['/app', '/app/favorites', '/app/visits', '/app/messages'], client, 'client')).toEqual([]);
    expect(motifsDeDisposition(['/app', '/app/payments', '/app/maintenance', '/app/messages'], client, 'client').length).toBeGreaterThan(0);
  });
});

describe('fidélité — le rôle commun vise la barre d’onglets par son slot (TCK-2738)', () => {
  /**
   * L'accueil admin au téléphone, réduit à ce qui comptait : la carte « Impayés » (171×128), qui
   * défile SOUS la barre fixe, contient elle aussi « Menu » dans sa clé de texte — et c'est la plus
   * petite boîte d'au moins 56 px qui le contient. `boiteDe: "Menu"` la retenait, pas la barre.
   */
  const texte = (id: number, cle: string, r: { x: number; y: number; w: number; h: number }) => ({ id, type: 'texte', cle, r });
  const boite = (id: number, cle: string, r: { x: number; y: number; w: number; h: number }, slot: string | null = null) => ({ id, type: 'boite', cle, r, slot, fid: null, tag: 'div' });
  const noeuds = [
    boite(0, 'page', { x: 0, y: 0, w: 390, h: 844 }),
    boite(1, 'Impayés Menu', { x: 16, y: 700, w: 171, h: 128 }),
    texte(2, 'Menu', { x: 40, y: 760, w: 40, h: 20 }),
    boite(3, 'Accueil Argent Biens Messages Menu', { x: 0, y: 780, w: 390, h: 64 }, 'barre-onglets'),
    texte(4, 'Menu', { x: 330, y: 800, w: 40, h: 20 }),
  ];
  const role = (coque.roles as Role[]).find((r) => r.nom === "coque · barre d'onglets")!;

  it('côté produit, la barre (`data-slot="barre-onglets"`, 64 px en bas du viewport), pas la carte « Impayés »', () => {
    const n = choisir(noeuds, role.produit) as { id: number; r: { y: number; h: number } } | null;
    expect(n?.id).toBe(3);
    expect(n!.r.y + n!.r.h).toBe(844);
  });

  it('témoin : l’ancien sélecteur `boiteDe: "Menu"` retient bien la carte', () => {
    expect((choisir(noeuds, { boiteDe: 'Menu', min: 56 }) as { id: number }).id).toBe(1);
  });
});
