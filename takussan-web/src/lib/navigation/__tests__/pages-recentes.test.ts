import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ESPACE_DU_COMPTE,
  EVENEMENT_PAGES_RECENTES,
  PAGES_RECENTES_MAX,
  clePagesRecentes,
  espaceDesRecents,
  lirePagesRecentes,
  oublierLesPagesRecentes,
  oublierPage,
  retenirFiche,
  retenirPage,
  titreRetenable,
} from '../pages-recentes';

const A = 'agency_admin:1';
const B = 'owner:7';

/**
 * TCK-2482 (A8) — les pages de `/app` ouvertes sur CET appareil, pour la palette : par compte, au plus
 * huit, le plus récent en tête, sans doublon ; rien hors de `/app` ; un stockage qui lève (navigation
 * privée, quota) ne casse rien. Rien ne part au serveur.
 *
 * TCK-2846 — et par ESPACE ; des fiches nommées (type, identifiant, titre) à côté des pages du menu.
 */
describe('pages récentes (TCK-2482)', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('la plus récente en tête, sans doublon', () => {
    retenirPage(1, A, '/app/payments');
    retenirPage(1, A, '/app/leases');
    retenirPage(1, A, '/app/payments');
    expect(lirePagesRecentes(1, A)).toEqual([{ chemin: '/app/payments' }, { chemin: '/app/leases' }]);
  });

  it(`au plus ${PAGES_RECENTES_MAX}`, () => {
    for (let i = 0; i < PAGES_RECENTES_MAX + 3; i++) retenirPage(1, A, `/app/section-${i}`);
    const lues = lirePagesRecentes(1, A);
    expect(lues).toHaveLength(PAGES_RECENTES_MAX);
    expect(lues[0]).toEqual({ chemin: `/app/section-${PAGES_RECENTES_MAX + 2}` });
  });

  it('seules les pages de /app sont retenues', () => {
    retenirPage(1, A, '/properties');
    retenirPage(1, A, '/application');
    retenirPage(1, A, '/app');
    expect(lirePagesRecentes(1, A)).toEqual([{ chemin: '/app' }]);
  });

  it('par compte : un autre compte du même appareil ne les lit pas', () => {
    retenirPage(1, A, '/app/payments');
    expect(lirePagesRecentes(2, A)).toEqual([]);
    expect(clePagesRecentes(1)).not.toBe(clePagesRecentes(2));
  });

  it('une valeur illisible ou d’une autre forme ne casse rien', () => {
    window.localStorage.setItem(clePagesRecentes(1), '{pas du json');
    expect(lirePagesRecentes(1, A)).toEqual([]);
    window.localStorage.setItem(
      clePagesRecentes(1),
      JSON.stringify({ v: 2, espaces: { [A]: [1, null, { chemin: '/ailleurs' }, { chemin: '/app/visits' }, { chemin: '/app/x', type: 'inconnu', id: '1', titre: 'X' }] } }),
    );
    expect(lirePagesRecentes(1, A)).toEqual([{ chemin: '/app/visits' }]);
  });

  it('un stockage qui lève ne casse rien', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => retenirPage(1, A, '/app/payments')).not.toThrow();
    expect(() => retenirFiche(1, A, { chemin: '/app/properties/1', type: 'bien', id: 1, titre: 'Villa' })).not.toThrow();
    expect(lirePagesRecentes(1, A)).toEqual([]);
  });
});

describe('TCK-2846 — des fiches nommées, par espace', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('AC1 — un bien puis une demande : la demande en tête, chacune sous son nom et son type', () => {
    retenirFiche(1, A, { chemin: '/app/properties/42', type: 'bien', id: 42, titre: 'Villa 4 chambres à Ngor' });
    retenirFiche(1, A, { chemin: '/app/leads?ouverte=9', type: 'demande', id: 9, titre: 'Moussa Diallo' });
    expect(lirePagesRecentes(1, A)).toEqual([
      { chemin: '/app/leads?ouverte=9', type: 'demande', id: '9', titre: 'Moussa Diallo' },
      { chemin: '/app/properties/42', type: 'bien', id: '42', titre: 'Villa 4 chambres à Ngor' },
    ]);
  });

  it('dédoublonnée par entité : rouvrir une fiche la remonte, avec son titre du jour', () => {
    retenirFiche(1, A, { chemin: '/app/properties/42', type: 'bien', id: 42, titre: 'Villa' });
    retenirFiche(1, A, { chemin: '/app/leases/3', type: 'bail', id: 3, titre: 'Bail de Awa' });
    retenirFiche(1, A, { chemin: '/app/properties/42', type: 'bien', id: 42, titre: 'Villa rénovée' });
    expect(lirePagesRecentes(1, A).map((p) => ('titre' in p ? p.titre : p.chemin))).toEqual(['Villa rénovée', 'Bail de Awa']);
  });

  it('une fiche ouverte depuis sa liste remplace la page de sa section (« Demandes » ne double pas « Moussa Diallo »)', () => {
    retenirPage(1, A, '/app/leads');
    retenirPage(1, A, '/app/payments');
    retenirFiche(1, A, { chemin: '/app/leads?ouverte=9', type: 'demande', id: 9, titre: 'Moussa Diallo' });
    expect(lirePagesRecentes(1, A).map((p) => p.chemin)).toEqual(['/app/leads?ouverte=9', '/app/payments']);
  });

  it('une page du menu ne déplace ni ne renomme le chemin qu’une fiche tient', () => {
    retenirFiche(1, A, { chemin: '/app/properties/42', type: 'bien', id: 42, titre: 'Villa' });
    retenirPage(1, A, '/app/payments');
    retenirPage(1, A, '/app/properties/42');
    expect(lirePagesRecentes(1, A)).toEqual([
      { chemin: '/app/payments' },
      { chemin: '/app/properties/42', type: 'bien', id: '42', titre: 'Villa' },
    ]);
  });

  it('AC3 — par espace : la fiche de l’espace A n’est pas dans l’espace B, et revient avec A', () => {
    retenirFiche(1, A, { chemin: '/app/properties/42', type: 'bien', id: 42, titre: 'Villa' });
    expect(lirePagesRecentes(1, B)).toEqual([]);
    retenirPage(1, B, '/app/payments');
    expect(lirePagesRecentes(1, B)).toEqual([{ chemin: '/app/payments' }]);
    expect(lirePagesRecentes(1, A)).toEqual([{ chemin: '/app/properties/42', type: 'bien', id: '42', titre: 'Villa' }]);
  });

  it('espace inconnu : ni lecture ni écriture, jamais une liste commune', () => {
    retenirFiche(1, null, { chemin: '/app/properties/42', type: 'bien', id: 42, titre: 'Villa' });
    retenirPage(1, undefined, '/app/payments');
    expect(window.localStorage.getItem(clePagesRecentes(1))).toBeNull();
    retenirPage(1, A, '/app/payments');
    expect(lirePagesRecentes(1, null)).toEqual([]);
  });

  it('AC4 — la déconnexion efface la clé de chaque compte, et rien d’autre', () => {
    retenirFiche(1, A, { chemin: '/app/properties/42', type: 'bien', id: 42, titre: 'Villa' });
    retenirPage(2, B, '/app/payments');
    window.localStorage.setItem('takussan.recherches-recentes', '[]');
    oublierLesPagesRecentes();
    expect(window.localStorage.getItem(clePagesRecentes(1))).toBeNull();
    expect(window.localStorage.getItem(clePagesRecentes(2))).toBeNull();
    expect(window.localStorage.getItem('takussan.recherches-recentes')).toBe('[]');
  });

  it('AC5 — aucun téléphone ni courriel dans la valeur écrite : un tel titre n’est pas retenu', () => {
    for (const titre of ['moussa@example.sn', '+221 77 123 45 67', '771234567', 'Visite de 77 123 45 67', '', '   ', null]) {
      retenirFiche(1, A, { chemin: '/app/customers/5', type: 'client', id: 5, titre });
    }
    retenirFiche(1, A, { chemin: '/app/customers/6', type: 'client', id: 6, titre: 'Awa Ndiaye' });
    const brut = window.localStorage.getItem(clePagesRecentes(1)) ?? '';
    expect(brut).not.toMatch(/@/);
    expect(brut).not.toMatch(/\d{2}\s?\d{3}\s?\d{2}\s?\d{2}/);
    expect(lirePagesRecentes(1, A)).toEqual([{ chemin: '/app/customers/6', type: 'client', id: '6', titre: 'Awa Ndiaye' }]);
    // Ce qu'elle garde d'une fiche : chemin, type, identifiant, titre — rien d'autre.
    expect(Object.keys(JSON.parse(brut).espaces[A][0]).sort()).toEqual(['chemin', 'id', 'titre', 'type']);
  });

  it('un titre ordinaire reste, une référence de bail aussi', () => {
    expect(titreRetenable('  Villa   4 chambres à Ngor ')).toBe('Villa 4 chambres à Ngor');
    expect(titreRetenable('BAIL-2026-000123')).toBe('BAIL-2026-000123');
    expect(titreRetenable('x'.repeat(200))?.length).toBe(80);
  });

  it('une fiche introuvable est oubliée, les autres restent', () => {
    retenirFiche(1, A, { chemin: '/app/properties/42', type: 'bien', id: 42, titre: 'Villa' });
    retenirFiche(1, A, { chemin: '/app/leases/3', type: 'bail', id: 3, titre: 'Bail de Awa' });
    oublierPage(1, A, '/app/properties/42');
    expect(lirePagesRecentes(1, A).map((p) => p.chemin)).toEqual(['/app/leases/3']);
  });

  it('migration douce : l’ancienne valeur (un tableau de chemins) est ignorée, puis remplacée', () => {
    window.localStorage.setItem(clePagesRecentes(1), JSON.stringify(['/app/leases/3', '/app/payments']));
    expect(lirePagesRecentes(1, A)).toEqual([]);
    retenirPage(1, A, '/app/payments');
    expect(JSON.parse(window.localStorage.getItem(clePagesRecentes(1)) ?? 'null')).toEqual({ v: 2, espaces: { [A]: [{ chemin: '/app/payments' }] } });
  });

  it('chaque écriture prévient les lecteurs du même onglet', () => {
    const ecoute = vi.fn();
    window.addEventListener(EVENEMENT_PAGES_RECENTES, ecoute);
    retenirFiche(1, A, { chemin: '/app/properties/42', type: 'bien', id: 42, titre: 'Villa' });
    window.removeEventListener(EVENEMENT_PAGES_RECENTES, ecoute);
    expect(ecoute).toHaveBeenCalledTimes(1);
  });
});

describe('TCK-2846 — l’ordre des écritures de la fiche et de la coque', () => {
  beforeEach(() => window.localStorage.clear());

  it('la fiche écrit AVANT la coque (même rendu) : la page de sa section ne repasse pas devant elle', () => {
    retenirFiche(1, A, { chemin: '/app/leads?ouverte=9', type: 'demande', id: 9, titre: 'Moussa Diallo' });
    retenirPage(1, A, '/app/leads');
    expect(lirePagesRecentes(1, A).map((p) => p.chemin)).toEqual(['/app/leads?ouverte=9']);
  });

  it('la coque écrit AVANT la fiche : la fiche remplace la page de sa section', () => {
    retenirPage(1, A, '/app/leads');
    retenirFiche(1, A, { chemin: '/app/leads?ouverte=9', type: 'demande', id: 9, titre: 'Moussa Diallo' });
    expect(lirePagesRecentes(1, A).map((p) => p.chemin)).toEqual(['/app/leads?ouverte=9']);
  });
});

describe('TCK-2846 — un compte sans profil (client, locataire) a ses récents', () => {
  beforeEach(() => window.localStorage.clear());

  it('le layout lie `null` : l’espace des récents est celui du compte, pas « aucun »', () => {
    expect(espaceDesRecents(null)).toBe(ESPACE_DU_COMPTE);
    expect(espaceDesRecents(undefined)).toBe(ESPACE_DU_COMPTE);
    expect(espaceDesRecents('owner:7')).toBe('owner:7');
    retenirFiche(1, espaceDesRecents(null), { chemin: '/app/leases/3', type: 'bail', id: 3, titre: 'Mon bail' });
    expect(lirePagesRecentes(1, espaceDesRecents(null))).toHaveLength(1);
  });
});
