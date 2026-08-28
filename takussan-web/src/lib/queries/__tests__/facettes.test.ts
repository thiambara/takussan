import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FRAICHEUR_DOMAINE_VILLES, villesDuCatalogue } from '../facettes';

/**
 * TCK-433 (passe 2) — **le module qui DÉCIDE « domaine inconnaissable » n'était éprouvé par rien.**
 *
 * Le seul test qui le touchait le REMPLAÇAIT par un double (`vi.mock('@/lib/queries/facettes')`) :
 * aucune de ses lignes ne s'exécutait. Ce qui était testé, c'était la RÉACTION du consommateur à
 * `villes: null` — pas la DÉCISION de le rendre. Deux ablations l'ont montré : neutraliser la
 * branche `truncated` laissait 84 tests verts, et faire rendre au `catch` une Map vide au lieu de
 * `null` en laissait 72.
 *
 * La conséquence de la première est la plus lourde : un domaine TRONQUÉ serait employé comme s'il
 * était complet, ce qui déclarerait non canonique chaque ville n'ayant pas tenu sous le plafond —
 * exactement ce que le docblock du module dit qu'il ne faut jamais faire.
 *
 * *Un module jumeau testé (`sitemap-catalogue.ts`) et un module de décision qui ne l'est pas, ce
 * n'est pas une asymétrie de couverture : c'est le second qui porte le jugement.*
 */

const appels: string[] = [];

function servir(charge: unknown, { ok = true }: { ok?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      appels.push(url);
      return { ok, status: ok ? 200 : 503, json: async () => charge } as unknown as Response;
    }),
  );
}

function reponse(
  villes: readonly { value: string; count: number }[],
  truncated = false,
) {
  return { data: villes, meta: { truncated } };
}

let journal: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  appels.length = 0;
  journal = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  journal.mockRestore();
});

describe('villesDuCatalogue — réponse normale', () => {
  it('rend une Map peuplée, sans rien journaliser', async () => {
    servir(reponse([{ value: 'Dakar', count: 199 }, { value: 'Thiès', count: 7 }]));

    const domaine = await villesDuCatalogue();

    expect(domaine).toBeInstanceOf(Map);
    expect(domaine!.size).toBe(2);
    expect(journal).not.toHaveBeenCalled();
  });

  it('interroge le bon endpoint, avec la fraîcheur déclarée', async () => {
    servir(reponse([{ value: 'Dakar', count: 1 }]));

    await villesDuCatalogue();

    expect(appels[0]).toContain('/public/properties/cities');
    // `revalidate` partage une réponse par heure au lieu d'un aller-retour par rendu : c'est ce
    // qui rend tenable un appel réseau dans la `generateMetadata` de la page la plus parcourue.
    const init = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![1];
    expect((init as { next?: { revalidate?: number } }).next?.revalidate).toBe(
      FRAICHEUR_DOMAINE_VILLES,
    );
  });

  it('un catalogue VIDE rend une Map vide — c’est une réponse, pas une panne', async () => {
    servir(reponse([]));

    const domaine = await villesDuCatalogue();

    expect(domaine).toBeInstanceOf(Map);
    expect(domaine!.size).toBe(0);
    expect(journal).not.toHaveBeenCalled();
  });
});

describe('villesDuCatalogue — le REPLI DE CASSE des clés', () => {
  it('indexe en minuscules et garde la casse du CATALOGUE en valeur', async () => {
    servir(reponse([{ value: 'Dakar', count: 199 }, { value: 'Saint-Louis', count: 5 }]));

    const domaine = await villesDuCatalogue();

    expect(domaine!.get('dakar')).toBe('Dakar');
    expect(domaine!.get('saint-louis')).toBe('Saint-Louis');
    // La clé est repliée, pas la valeur : sans cette asymétrie, `?city=dakar` et `?city=Dakar`
    // produiraient deux canoniques.
    expect(domaine!.get('Dakar')).toBeUndefined();
  });

  it('replie aussi les caractères accentués', async () => {
    servir(reponse([{ value: 'Thiès', count: 7 }]));

    const domaine = await villesDuCatalogue();

    expect(domaine!.get('thiès')).toBe('Thiès');
    // ⚠ Les ACCENTS ne sont pas repliés, délibérément (ADR-0025 : `Café` ≠ `Cafe`).
    // `?city=Thies` se repliera donc sur la page nue. C'est figé ici pour que le jour où
    // quelqu'un veut le changer, il voie que c'était une décision.
    expect(domaine!.get('thies')).toBeUndefined();
  });

  it('ignore une ville vide plutôt que d’indexer la chaîne vide', async () => {
    servir(reponse([{ value: '', count: 3 }, { value: 'Dakar', count: 1 }]));

    const domaine = await villesDuCatalogue();

    expect(domaine!.size).toBe(1);
    expect(domaine!.has('')).toBe(false);
  });
});

describe('villesDuCatalogue — DOMAINE INCONNAISSABLE', () => {
  it('`truncated: true` rend `null` et le JOURNALISE', async () => {
    /*
     * ⚠ Le cas le plus lourd. Un domaine tronqué employé comme s'il était complet déclarerait
     * non canonique chaque ville qui n'a pas tenu sous le plafond — c'est-à-dire décider du
     * périmètre d'indexation par un effet de bord du plafond serveur.
     */
    servir(reponse([{ value: 'Dakar', count: 199 }], true));

    const domaine = await villesDuCatalogue();

    expect(domaine).toBeNull();
    expect(journal).toHaveBeenCalledTimes(1);
    expect(String(journal.mock.calls[0]![0])).toContain('TRONQUÉ');
  });

  it('une réponse en ERREUR rend `null` et le journalise', async () => {
    servir({}, { ok: false });

    const domaine = await villesDuCatalogue();

    expect(domaine).toBeNull();
    expect(journal).toHaveBeenCalledTimes(1);
  });

  it('une PANNE RÉSEAU rend `null` et le journalise', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    const domaine = await villesDuCatalogue();

    expect(domaine).toBeNull();
    expect(journal).toHaveBeenCalledTimes(1);
    expect(String(journal.mock.calls[0]![0])).toContain('indisponible');
  });

  it('`null` n’est JAMAIS confondu avec une Map vide', async () => {
    // Les deux font replier chez l'appelant, mais ils ne veulent pas dire la même chose : `null`
    // = « on ne sait pas », Map vide = « le catalogue n'a aucune ville ». Seul le premier se
    // journalise, et un `catch` qui rendrait `new Map()` effacerait la distinction en silence.
    servir(reponse([], true));
    expect(await villesDuCatalogue()).toBeNull();

    vi.unstubAllGlobals();
    servir(reponse([]));
    expect(await villesDuCatalogue()).toBeInstanceOf(Map);
  });
});
